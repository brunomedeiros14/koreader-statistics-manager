local _ = require("gettext")
local SQ3 = require("lua-ljsqlite3/init")
local DataStorage = require("datastorage")
local UIManager = require("ui/uimanager")
local logger = require("logger")
local rapidjson = require("rapidjson")

local LeituraApi = require("leitura_api")

local OUTBOX_DB_PATH = DataStorage:getSettingsDir() .. "/leitura_outbox.sqlite3"

local MAX_SYNC_OPS = 200
local FLUSH_DELAY_S = 5

local LeituraOutbox = {}

local flush_scheduled = false

-- Opens the DB (creating the cache/outbox schema on first use). Caller closes.
function LeituraOutbox.openDb()
  local db = SQ3.open(OUTBOX_DB_PATH)
  if not db then
    logger.warn("LeituraOutbox: falha ao abrir", OUTBOX_DB_PATH)
    return nil
  end

  db:exec([[
    CREATE TABLE IF NOT EXISTS cache_registros (
      op_id      TEXT PRIMARY KEY,
      payload    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      synced     INTEGER NOT NULL DEFAULT 0
    );
  ]])

  db:exec([[
    CREATE TABLE IF NOT EXISTS outbox (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      payload    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending'
    );
  ]])

  return db
end

-- Registers a record locally and queues it for server sync.
-- payload must include op_id. Returns the record's op_id or nil.
function LeituraOutbox.addRecord(payload)
  if not payload or type(payload) ~= "table" or not payload.op_id then return nil end

  local ok, encoded = pcall(rapidjson.encode, payload)
  if not ok or not encoded then
    logger.warn("LeituraOutbox: falha ao codificar registro")
    return nil
  end

  local db = LeituraOutbox.openDb()
  if not db then return nil end

  local upsert = db:prepare([[
    INSERT OR REPLACE INTO cache_registros (op_id, payload, created_at, synced)
    VALUES (?, ?, ?, 0)
  ]])
  if upsert then
    upsert:bind(payload.op_id, encoded, os.time())
    upsert:step()
    upsert:close()
  end

  local stmt = db:prepare([[
    INSERT INTO outbox (payload, created_at, status) VALUES (?, ?, 'pending')
  ]])
  if stmt then
    stmt:bind(encoded, os.time())
    stmt:step()
    stmt:close()
  end

  db:close()
  LeituraOutbox.scheduleFlush()
  return payload.op_id
end

-- Marks a record as synced (server accepted it).
function LeituraOutbox.markSynced(op_id)
  if not op_id then return end
  local db = LeituraOutbox.openDb()
  if not db then return end
  db:exec(string.format(
    "UPDATE cache_registros SET synced = 1 WHERE op_id = '%s'",
    tostring(op_id):gsub("'", "''")
  ))
  db:close()
end

function LeituraOutbox.pendingCount()
  local db = LeituraOutbox.openDb()
  if not db then return 0 end

  local stmt = db:prepare("SELECT COUNT(*) FROM outbox WHERE status = 'pending'")
  local count = 0
  if stmt then
    local res, nb = stmt:reset():resultset("i")
    if res and nb and nb > 0 then
      count = tonumber(res[1][1]) or 0
    end
    stmt:close()
  end

  db:close()
  return count
end

-- Debounced: future enqueues coalesce into a single flush.
function LeituraOutbox.scheduleFlush()
  if flush_scheduled then return end
  flush_scheduled = true
  UIManager:scheduleIn(FLUSH_DELAY_S, function()
    flush_scheduled = false
    LeituraOutbox.flush()
  end)
end

-- Replays pending outbox rows against POST /api/leitura (idempotent via op_id).
-- Transport failures leave rows pending; server-side validation errors are
-- marked 'failed' so they stop retrying.
function LeituraOutbox.flush()
  local db = LeituraOutbox.openDb()
  if not db then return { flushed = 0, failed = 0 } end

  local loaded, NetworkMgr = pcall(require, "ui/network/manager")
  if loaded and NetworkMgr and not NetworkMgr:isConnected() then
    -- O NetworkMgr do KOReader pode não enxergar rede gerenciada pelo SO
    -- (desktop/emulador). Tentamos mesmo assim; falha de transporte deixa pendente.
    logger.warn("LeituraOutbox: NetworkMgr sem conexão, tentando enviar mesmo assim")
  end

  local stmt = db:prepare([[
    SELECT id, payload FROM outbox
    WHERE status = 'pending' ORDER BY id ASC LIMIT ?
  ]])
  if not stmt then
    db:close()
    return { flushed = 0, failed = 0 }
  end

  local rows = {}
  stmt:bind(MAX_SYNC_OPS)
  local res = stmt:resultset("i")
  if res then
    for i = 1, #res[1] do
      local ok_payload, payload = pcall(rapidjson.decode, res[2][i])
      if ok_payload and type(payload) == "table" then
        table.insert(rows, { id = res[1][i], payload = payload })
      end
    end
  end
  stmt:close()

  if #rows == 0 then
    db:close()
    return { flushed = 0, failed = 0 }
  end

  local flushed = 0
  local failed = 0

  for _, row in ipairs(rows) do
    local result, err = LeituraApi.submit(row.payload)
    local new_status
    if result and result.ok then
      new_status = "done"
      flushed = flushed + 1
      if result.id and row.payload then
        row.payload.id = result.id
        local ok_enc, encoded = pcall(rapidjson.encode, row.payload)
        local set = ok_enc and db:prepare("UPDATE cache_registros SET payload = ?, synced = 1 WHERE op_id = ?")
        if set then
          set:bind(encoded, row.payload.op_id)
          set:step()
          set:close()
        end
      end
      LeituraOutbox.markSynced(row.payload.op_id)
    elseif result and not result.ok then
      new_status = "failed"
      failed = failed + 1
      logger.warn("LeituraOutbox: registro rejeitado:", result.error)
    else
      -- Transport error: stop the batch, leave the rest pending for retry.
      logger.dbg("LeituraOutbox: sync falhou, fila fica pendente:", err)
      db:close()
      return { flushed = flushed, failed = failed }
    end

    local update = db:prepare("UPDATE outbox SET status = ? WHERE id = ?")
    if update then
      update:bind(new_status, row.id)
      update:step()
      update:close()
    end
  end

  db:close()
  return { flushed = flushed, failed = failed }
end

-- Pending outbox payloads (not yet confirmed by the server). Used so
-- syncStats can inject local readings into statistics.sqlite3 even offline.
function LeituraOutbox.listPending()
  local db = LeituraOutbox.openDb()
  if not db then return {} end

  local stmt = db:prepare([[
    SELECT payload FROM outbox
    WHERE status = 'pending' ORDER BY id ASC
  ]])
  if not stmt then
    db:close()
    return {}
  end

  local payloads = {}
  local res, nb = stmt:resultset("i")
  if res then
    for i = 1, #res[1] do
      local ok_payload, decoded = pcall(rapidjson.decode, res[1][i])
      if ok_payload and type(decoded) == "table" then
        table.insert(payloads, decoded)
      end
    end
  end
  stmt:close()
  db:close()
  return payloads
end

-- Most recent local record whose payload matches the book's md5, used to
-- prefill page defaults in the wizard. Returns the decoded payload or nil.
function LeituraOutbox.lastRecordForBook(md5)
  if not md5 then return nil end
  local db = LeituraOutbox.openDb()
  if not db then return nil end

  local stmt = db:prepare([[
    SELECT payload FROM cache_registros
    ORDER BY created_at DESC, op_id DESC
  ]])
  if not stmt then
    db:close()
    return nil
  end

  local payload
  local res, nb = stmt:resultset("i")
  if res then
    for i = 1, #res[1] do
      local ok, decoded = pcall(rapidjson.decode, res[1][i])
      if ok and type(decoded) == "table" and decoded.md5 == md5 then
        payload = decoded
        break
      end
    end
  end
  stmt:close()
  db:close()
  return payload
end

-- Local history (read-only source for Histórico/Estatísticas).
function LeituraOutbox.listRecords()
  local db = LeituraOutbox.openDb()
  if not db then return {} end

  local stmt = db:prepare([[
    SELECT op_id, payload, created_at, synced FROM cache_registros
    ORDER BY created_at DESC, op_id DESC
  ]])
  if not stmt then
    db:close()
    return {}
  end

  local records = {}
  local res, nb = stmt:resultset("i")
  if res then
    for i = 1, #res[1] do
      local ok_payload, payload = pcall(rapidjson.decode, res[2][i])
      if ok_payload and type(payload) == "table" then
        table.insert(records, {
          op_id = res[1][i],
          record = payload,
          created_at = tonumber(res[3][i]),
          synced = res[4][i],
        })
      end
    end
  end
  stmt:close()
  db:close()
  return records
end

-- Deletes a record locally. On connectivity, also removes it server-side.
function LeituraOutbox.deleteRecord(op_id)
  if not op_id then return nil, _("registro inválido") end

  local db = LeituraOutbox.openDb()
  if not db then return nil, _("cache indisponível") end

  local stmt = db:prepare("SELECT payload, synced FROM cache_registros WHERE op_id = ?")
  local payload, synced
  if stmt then
    local res, nb = stmt:reset():bind(op_id):resultset("i")
    if res and nb and nb > 0 then
      local ok_payload, decoded = pcall(rapidjson.decode, res[1][1])
      payload = ok_payload and decoded or nil
      synced = res[2][1]
    end
    stmt:close()
  end

  if not payload then
    db:close()
    return nil, _("registro não encontrado")
  end

  if synced == 1 and payload.id then
    LeituraApi.remove(payload.id)
  end

  local del = db:prepare("DELETE FROM cache_registros WHERE op_id = ?")
  if del then
    del:bind(op_id):step()
  else
    db:close()
    return nil, _("cache indisponível")
  end
  db:close()
  return true
end

-- Pulls server records into the local cache so Histórico/Estatísticas work offline.
function LeituraOutbox.pullFromServer()
  local db = LeituraOutbox.openDb()
  if not db then return 0 end

  local page = 1
  local pulled = 0
  while true do
    local data, err = LeituraApi.list(page, MAX_SYNC_OPS)
    if not data or not data.registros then
      if page > 1 then break end
      db:close()
      return pulled
    end
    for _, row in ipairs(data.registros) do
      local op_id = row.op_id
      if not op_id then
        op_id = "server:" .. tostring(row.id)
      end
      row.op_id = op_id
      local ok, encoded = pcall(rapidjson.encode, row)
      if ok and encoded then
        local upsert = db:prepare([[
          INSERT OR REPLACE INTO cache_registros (op_id, payload, created_at, synced)
          VALUES (?, ?, ?, 1)
        ]])
        if upsert then
          upsert:bind(op_id, encoded, os.time())
          upsert:step()
          upsert:close()
        end
      end
      pulled = pulled + 1
    end
    if page >= (data.pages or math.ceil(data.total / MAX_SYNC_OPS)) then break end
    page = page + 1
  end

  db:close()
  return pulled
end

return LeituraOutbox
