local _ = require("gettext")
local SQ3 = require("lua-ljsqlite3/init")
local logger = require("logger")
local StatsBooks = require("stats_books")

local StatsSync = {}

-- Maps a page between different page-counting systems (book vs. KOReader).
function StatsSync.referencePage(page, sourceTotalPages, targetTotalPages)
  if sourceTotalPages == 1 then return 1 end
  return math.floor(
    0.5 + 1 + ((page - 1) * (targetTotalPages - 1)) / (sourceTotalPages - 1)
  )
end

local function getReferenceTotalPages(db, bookId, sourceTotalPages)
  local totalPages
  local stmt = db:prepare([[
    SELECT total_pages FROM page_stat_data
    WHERE id_book = ? ORDER BY start_time DESC LIMIT 1
  ]])
  if stmt then
    local res, nb = stmt:reset():bind(bookId):resultset("i")
    if res and nb and nb > 0 then
      totalPages = tonumber(res[1][1])
    end
    stmt:close()
  end

  if not totalPages then
    local bookStmt = db:prepare("SELECT pages FROM book WHERE id = ?")
    if bookStmt then
      local res, nb = bookStmt:reset():bind(bookId):resultset("i")
      if res and nb and nb > 0 then
        totalPages = tonumber(res[1][1])
      end
      bookStmt:close()
    end
  end

  totalPages = totalPages or sourceTotalPages
  totalPages = tonumber(totalPages)
  if not totalPages or not (totalPages == math.floor(totalPages)) or totalPages <= 0 then
    return nil
  end
  return totalPages
end

local function parseIsoToTime(iso)
  local y, m, d, h, mi = iso:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+)")
  if not y then return nil end
  return os.time{ year = tonumber(y), month = tonumber(m), day = tonumber(d),
                  hour = tonumber(h), min = tonumber(mi), sec = 0 }
end

-- Inserts page_stat_data rows for one reading, distributing the elapsed time
-- evenly across the converted page range. Idempotent via INSERT OR IGNORE
-- (deterministic replays produce identical (page, start_time) pairs).
local function insertReading(db, input)
  local totalPages = getReferenceTotalPages(db, input.book_id, input.source_total_pages)
  if not totalPages then
    return nil, _("livro sem total de páginas válido em statistics.sqlite3")
  end

  local firstPage = StatsSync.referencePage(input.start_page, input.source_total_pages, totalPages)
  local lastPage = StatsSync.referencePage(input.finish_page, input.source_total_pages, totalPages)
  local elapsed = input.finished_at - input.started_at
  if elapsed <= 0 then
    return nil, _("término deve ser posterior ao início da leitura")
  end

  local pageCount = (lastPage - firstPage + 1)
  if pageCount <= 0 then
    return nil, _("intervalo de páginas inválido após conversão")
  end

  local insert = db:prepare([[
    INSERT OR IGNORE INTO page_stat_data (id_book, page, start_time, duration, total_pages)
    VALUES (?, ?, ?, ?, ?)
  ]])
  if not insert then
    return nil, _("falha ao preparar gravação em page_stat_data")
  end

  local inserted = 0
  local ok_begin, begin_err = pcall(function()
    db:exec("BEGIN")
  end)
  if not ok_begin then
    insert:close()
    return nil, tostring(begin_err)
  end

  for offset = 0, pageCount - 1 do
    local pageStart = input.started_at + math.floor((elapsed * offset) / pageCount)
    local nextPageStart = input.started_at + math.floor((elapsed * (offset + 1)) / pageCount)
    insert:reset():bind(input.book_id, firstPage + offset, pageStart, nextPageStart - pageStart, totalPages):step()
    inserted = inserted + 1
  end

  pcall(function()
    db:exec("COMMIT")
  end)
  insert:close()

  return { first_page = firstPage, last_page = lastPage, pages = inserted }
end

-- Runs the sync engine for one server record. Returns nil, err on failure.
-- record expects: md5, data_hora_1, data_hora_2, numero_1, numero_2, numero_3.
function StatsSync.run(record)
  if not record or not record.md5 then
    return nil, _("registro sem md5")
  end

  local startedAt = parseIsoToTime(record.data_hora_1)
  local finishedAt = parseIsoToTime(record.data_hora_2)
  if not startedAt or not finishedAt then
    return nil, _("data/hora inválidas no registro")
  end

  local db = StatsBooks.openStatsDb()
  if not db then return nil, _("falha ao abrir statistics.sqlite3") end

  local bookId
  local stmt = db:prepare("SELECT id FROM book WHERE md5 = ?")
  if stmt then
    local res, nb = stmt:reset():bind(record.md5):resultset("i")
    if res and nb and nb > 0 then
      bookId = tonumber(res[1][1])
    end
    stmt:close()
  end

  if not bookId then
    db:close()
    return nil,
      string.format(_("livro com md5 %s não encontrado em statistics.sqlite3"), tostring(record.md5)),
      "book_not_found"
  end

  local result, err = insertReading(db, {
    book_id = bookId,
    started_at = startedAt,
    finished_at = finishedAt,
    start_page = tonumber(record.numero_1) or 0,
    finish_page = tonumber(record.numero_2) or 0,
    source_total_pages = tonumber(record.numero_3) or 0,
  })
  db:close()

  if not result then
    return nil, err
  end

  logger.dbg("[leitura_manual] StatsSync: livro", bookId,
    "páginas", result.pages,
    "(" .. result.first_page .. "–" .. result.last_page .. ")")
  return result
end

return StatsSync