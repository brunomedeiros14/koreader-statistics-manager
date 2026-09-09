local _ = require("gettext")
local ConfirmBox = require("ui/widget/confirmbox")
local InputDialog = require("ui/widget/inputdialog")
local InfoMessage = require("ui/widget/infomessage")
local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local LeituraApi = require("leitura_api")
local LeituraOutbox = require("leitura_outbox")
local PaginatedList = require("paginated_list")

local leitura_manual = WidgetContainer:extend({
  name = "leitura_manual",
  is_doc_only = false,
})

function leitura_manual:init()
  self.ui.menu:registerToMainMenu(self)
end

function leitura_manual:addToMainMenu(menu_items)
  menu_items.leitura_manual = {
    text = _("Leitura manual"),
    sorting_hint = "tools",
    sub_item_table = {
      {
        text = _("Abrir formulário"),
        callback = function()
          self:openForm()
        end,
      },
      {
        text = _("Histórico"),
        callback = function()
          self:showHistory()
        end,
      },
      {
        text = _("Estatísticas"),
        callback = function()
          self:showStats()
        end,
      },
      {
        text = _("Sincronizar agora"),
        callback = function()
          self:syncNow()
        end,
      },
      {
        text = _("Sincronizar estatísticas"),
        callback = function()
          self:syncStats()
        end,
      },
      {
        text = _("Definir servidor"),
        callback = function()
          self:configureServer()
        end,
      },
    },
  }
end

function leitura_manual:openForm()
  local Wizard = require("wizard")
  Wizard:new():run()
end

function leitura_manual:configureServer()
  local dialog
  dialog = InputDialog:new {
    title = _("URL do servidor"),
    description = _("Endereço do servidor (ex.: http://192.168.0.10:3000)"),
    input = LeituraApi.getServerUrl(),
    buttons = {
      {
        {
          text = _("Cancelar"),
          id = "close",
          callback = function()
            UIManager:close(dialog)
          end,
        },
        {
          text = _("Salvar"),
          callback = function()
            LeituraApi.setServerUrl(dialog:getInputText())
            UIManager:close(dialog)
          end,
        },
      },
    },
  }
  UIManager:show(dialog)
end

function leitura_manual:syncNow()
  local result = LeituraOutbox.flush()
  local pending = LeituraOutbox.pendingCount()
  local pulled = LeituraOutbox.pullFromServer()

  local lines = {
    string.format(_("Enviados: %d"), result.flushed or 0),
    string.format(_("Falhas: %d"), result.failed or 0),
    string.format(_("Ainda pendentes: %d"), pending),
    string.format(_("Registros puxados do servidor: %d"), pulled),
  }
  if (result.flushed or 0) == 0 and pending > 0 then
    table.insert(lines, "")
    table.insert(lines,
      _("Nenhum envio: confira a URL do servidor (Definir servidor) e a rede."))
  end
  UIManager:show(InfoMessage:new {
    text = table.concat(lines, "\n"),
  })
end

-- Injects readings into statistics.sqlite3. Works in two passes so local
-- readings are stamped even before the server round-trip completes:
--   1) local pending outbox records (independent of connectivity);
--   2) server records with leitura_sincronizada = 0 (marked synced/skipped).
function leitura_manual:syncStats()
  local StatsSync = require("stats_sync")

  -- Opportunity to push pending local records before pulling.
  LeituraOutbox.flush()

  local local_injected = 0
  local synced = 0
  local skipped = 0
  local failed = 0
  local errors = {}

  -- Pass 1: local records still waiting to reach the server.
  -- book_not_found is left alone here (no server id to mark it skipped yet).
  for _, payload in ipairs(LeituraOutbox.listPending()) do
    local result, sync_err, sync_code = StatsSync.run(payload)
    if result then
      local_injected = local_injected + 1
    elseif sync_code ~= "book_not_found" then
      failed = failed + 1
      table.insert(errors, tostring(sync_err))
    end
  end

  -- Pass 2: server records pending stats stamp.
  local total = 1
  local page = 1
  while page <= total do
    local data, err = LeituraApi.listUnsynced(page, 200)
    if not data or not data.registros then
      local lines = {
        _("Falha ao consultar o servidor:"),
        tostring(err or _("rede indisponível")),
      }
      UIManager:show(InfoMessage:new { text = table.concat(lines, "\n") })
      return
    end

    total = data.pages or math.max(1, math.ceil((data.total or 0) / 200))
    for _, record in ipairs(data.registros) do
      local result, sync_err, sync_code = StatsSync.run(record)
      if result then
        local marked, mark_err = LeituraApi.markSynced(record.id)
        if marked and marked.ok then
          synced = synced + 1
        else
          failed = failed + 1
          table.insert(errors, string.format(_("marcação #%s: %s"),
            tostring(record.id), tostring(mark_err or _("falha"))))
        end
      elseif sync_code == "book_not_found" then
        -- Book absent from statistics.sqlite3: never syncable, skip it.
        local marked, skip_err = LeituraApi.markSkipped(record.id)
        if marked and marked.ok then
          skipped = skipped + 1
        else
          failed = failed + 1
          table.insert(errors, string.format(_("skip #%s: %s"),
            tostring(record.id), tostring(skip_err or _("falha"))))
        end
      else
        failed = failed + 1
        table.insert(errors, tostring(sync_err))
      end
    end
    page = page + 1
  end

  local lines = {
    string.format(_("Sincronizados com statistics.sqlite3: %d"), synced),
    string.format(_("Puladas (livro ausente): %d"), skipped),
    string.format(_("Injetadas diretamente do cache local: %d"), local_injected),
    string.format(_("Falhas: %d"), failed),
  }
  if #errors > 0 and failed <= 3 then
    table.insert(lines, "")
    for _, e in ipairs(errors) do
      table.insert(lines, "• " .. e)
    end
  elseif #errors > 0 then
    table.insert(lines, "")
    table.insert(lines, string.format(_("Primeiro erro: %s"), errors[1]))
  end
  UIManager:show(InfoMessage:new {
    text = table.concat(lines, "\n"),
  })
end

function leitura_manual:showHistory()
  local records = LeituraOutbox.listRecords()
  if #records == 0 then
    UIManager:show(InfoMessage:new {
      text = _("Nenhum registro local."),
    })
    return
  end

  local items = {}
  for _, entry in ipairs(records) do
    table.insert(items, {
      text = self:historySummary(entry.record),
      value = entry,
    })
  end

  UIManager:show(PaginatedList:new {
    title = _("Histórico"),
    items = items,
    page = 1,
    on_prev = function() end,
    on_next = function() end,
    on_cancel = function() end,
    on_item = function(entry)
      self:showRecord(entry)
    end,
  })
end

function leitura_manual:showRecord(entry)
  local record = entry.record
  local label = self:historySummary(record) .. "\n\n"
      .. string.format(_("Data/hora 1: %s"), record.data_hora_1 or _("—")) .. "\n"
      .. string.format(_("Data/hora 2: %s"), record.data_hora_2 or _("—")) .. "\n"
      .. string.format(_("Inputs: %d / %d / %d"),
        record.numero_1 or 0, record.numero_2 or 0, record.numero_3 or 0)
  UIManager:show(ConfirmBox:new {
    text = label,
    ok_text = _("Excluir"),
    cancel_text = _("Fechar"),
    ok_callback = function()
      local deleted, err = LeituraOutbox.deleteRecord(entry.op_id)
      UIManager:show(InfoMessage:new {
        text = deleted and _("Registro excluído.") or string.format(_("Falha ao excluir: %s"), tostring(err)),
      })
    end,
  })
end

function leitura_manual:historySummary(record)
  local opcao = record.titulo or record.tipo or string.format("#%s…", tostring(record.md5 or "?"):sub(1, 8))
  local ini = record.data_hora_1 or _("—")
  local fim = record.data_hora_2 or _("—")
  local dur = self:payloadDuration(record)
  if dur then
    return string.format("%s — %s → %s (%s)", opcao, ini, fim, dur)
  end
  return string.format("%s — %s → %s", opcao, ini, fim)
end

function leitura_manual:showStats()
  local records = LeituraOutbox.listRecords()
  if #records == 0 then
    UIManager:show(InfoMessage:new {
      text = _("Sem dados para estatísticas."),
    })
    return
  end

  local total = #records
  local sum = 0
  local sum_n1, sum_n2, sum_n3 = 0, 0, 0
  local by_opcao = {}
  for _, entry in ipairs(records) do
    local r = entry.record
    sum = sum + (self:durationSeconds(r) or 0)
    sum_n1 = sum_n1 + (tonumber(r.numero_1) or 0)
    sum_n2 = sum_n2 + (tonumber(r.numero_2) or 0)
    sum_n3 = sum_n3 + (tonumber(r.numero_3) or 0)
    local key = r.titulo or r.tipo or string.format("#%s…", tostring(r.md5 or "?"):sub(1, 8))
    by_opcao[key] = (by_opcao[key] or 0) + 1
  end

  local lines = {
    string.format(_("Registros: %d"), total),
    string.format(_("Tempo total: %s"), self:formatDuration(sum)),
  }
  for opcao, n in pairs(by_opcao) do
    table.insert(lines, string.format(_("%s: %d"), opcao, n))
  end
  UIManager:show(InfoMessage:new {
    text = table.concat(lines, "\n"),
  })
end

-- Returns seconds between data_hora_1 and data_hora_2, or nil if unparseable.
function leitura_manual:durationSeconds(record)
  local a = record.data_hora_1
  local b = record.data_hora_2
  if not a or not b then return nil end
  local y1, m1, d1, h1, mi1 = a:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+)")
  local y2, m2, d2, h2, mi2 = b:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+)")
  if not y1 or not y2 then return nil end
  return (tonumber(h2) - tonumber(h1)) * 3600
      + (tonumber(mi2) - tonumber(mi1)) * 60
      + (tonumber(d2) - tonumber(d1)) * 86400
end

function leitura_manual:payloadDuration(record)
  local seconds = self:durationSeconds(record)
  if not seconds then return nil end
  return self:formatDuration(seconds)
end

function leitura_manual:formatDuration(seconds)
  seconds = math.max(0, math.floor(seconds or 0))
  local hours = math.floor(seconds / 3600)
  local minutes = math.floor((seconds % 3600) / 60)
  local secs = seconds % 60
  if hours > 0 then
    return string.format("%dh %02dm %02ds", hours, minutes, secs)
  end
  if minutes > 0 then
    return string.format("%dm %02ds", minutes, secs)
  end
  return string.format("%ds", secs)
end

return leitura_manual
