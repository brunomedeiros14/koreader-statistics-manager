local _ = require("gettext")
local DateTimeWidget = require("ui/widget/datetimewidget")
local InfoMessage = require("ui/widget/infomessage")
local SpinWidget = require("ui/widget/spinwidget")
local UIManager = require("ui/uimanager")
local logger = require("logger")
local PaginatedList = require("paginated_list")
local LeituraOutbox = require("leitura_outbox")
local StatsBooks = require("stats_books")

local Wizard = {}

function Wizard:new()
  local w = {
    data = {},
    page = 1,
    books = {},
    book_texts = {},
  }
  setmetatable(w, self)
  self.__index = self
  return w
end

function Wizard:show(widget)
  UIManager:scheduleIn(0, function()
    UIManager:show(widget)
  end)
end

function Wizard:newOpId()
  local seed = tostring(os.time()) .. ":" .. tostring(math.random(1, 999999999))
  return seed:lower():gsub("[^%x]", "")
end

function Wizard:run()
  logger.dbg("[leitura_manual] iniciando formulário")
  self.books = StatsBooks.list()
  if #self.books == 0 then
    UIManager:show(InfoMessage:new{
      text = _("Nenhum livro encontrado em statistics.sqlite3.\n\n"
        .. "Leia um arquivo no KOReader com estatísticas ativas para que o livro apareça aqui."),
    })
    return
  end
  self.book_texts = {}
  self.list_items = {}
  for i, book in ipairs(self.books) do
    local label = book.title .. "\n   " .. StatsBooks.formatLastRead(book)
    table.insert(self.list_items, { text = label, value = i })
    self.book_texts[i] = book
  end
  self:stepBook()
end

function Wizard:stepBook()
  self:show(PaginatedList:new{
    title = _("Passo 1 — Escolha o livro"),
    items = self.list_items,
    page = self.page,
    on_prev = function()
      self.page = self.page - 1
      self:stepBook()
    end,
    on_next = function()
      self.page = self.page + 1
      self:stepBook()
    end,
    on_cancel = function()
      self:abort()
    end,
    on_item = function(index)
      self.data.book = self.books[index]
      self.data.last_record = LeituraOutbox.lastRecordForBook(self.data.book.md5)
      self:stepDatetime1()
    end,
  })
end

function Wizard:stepDatetime1()
  self:stepDatetime(_("Passo 2 — Início da leitura"), "data_hora_1")
end

function Wizard:stepDatetime2()
  self:stepDatetime(_("Passo 3 — Término da leitura"), "data_hora_2")
end

function Wizard:stepDatetime(title, key)
  local now = os.date("*t")
  local dt = DateTimeWidget:new{
    title_text = title,
    year = now.year,
    month = now.month,
    day = now.day,
    hour = now.hour,
    min = now.min,
    ok_text = _("Continuar"),
    callback = function(time)
      self.data[key] = {
        year = time.year,
        month = time.month,
        day = time.day,
        hour = time.hour,
        min = time.min,
      }
      if key == "data_hora_1" then
        self:stepDatetime2()
      else
        self:stepStartPage()
      end
    end,
  }
  self:show(dt)
end

function Wizard:stepStartPage()
  local last = self.data.last_record
  local start_default = 1
  if last and last.numero_2 and tonumber(last.numero_2) > 0 then
    start_default = last.numero_2
  end
  self:show(SpinWidget:new{
    title_text = _("Passo 4 — Página inicial da leitura"),
    value = start_default,
    value_min = 1,
    value_max = 9999,
    value_step = 1,
    value_hold_step = 10,
    default_value = start_default,
    ok_always_enabled = true,
    ok_text = _("Continuar"),
    callback = function(widget)
      self.data.numero_1 = widget.value
      self:stepFinishPage()
    end,
  })
end

function Wizard:stepFinishPage()
  self:show(SpinWidget:new{
    title_text = _("Passo 5 — Página final da leitura"),
    value = self.data.numero_1,
    value_min = self.data.numero_1 or 1,
    value_max = 9999,
    value_step = 1,
    value_hold_step = 10,
    default_value = self.data.numero_1 or 1,
    ok_always_enabled = true,
    ok_text = _("Continuar"),
    callback = function(widget)
      self.data.numero_2 = widget.value
      self:stepTotalPages()
    end,
  })
end

function Wizard:stepTotalPages()
  local last = self.data.last_record
  local total_default = 1
  if last and last.numero_3 and tonumber(last.numero_3) > 0 then
    total_default = last.numero_3
  end
  self:show(SpinWidget:new{
    title_text = _("Passo 6 — Total de páginas do livro"),
    value = total_default,
    value_min = 1,
    value_max = 9999,
    value_step = 1,
    value_hold_step = 10,
    default_value = total_default,
    ok_always_enabled = true,
    ok_text = _("Continuar"),
    callback = function(widget)
      self.data.numero_3 = widget.value
      self:finish()
    end,
  })
end

function Wizard:finish()
  local d = self.data
  local book = d.book
  local payload = {
    op_id = self:newOpId(),
    md5 = book.md5,
    titulo = book.title,
    origem = "plugin",
    data_hora_1 = self:toIso(d.data_hora_1),
    data_hora_2 = self:toIso(d.data_hora_2),
    numero_1 = tonumber(d.numero_1) or 0,
    numero_2 = tonumber(d.numero_2) or 0,
    numero_3 = tonumber(d.numero_3) or 0,
  }

  local op_id = LeituraOutbox.addRecord(payload)
  local pending = LeituraOutbox.pendingCount()

  local summary
  if op_id then
    summary = self:buildSummary(pending, nil)
  else
    summary = self:buildSummary(-1, _("falha ao registrar localmente"))
  end
  UIManager:show(InfoMessage:new{
    text = summary,
  })
end

function Wizard:toIso(ts)
  if not ts then
    return nil
  end
  return string.format("%04d-%02d-%02dT%02d:%02d", ts.year, ts.month, ts.day, ts.hour, ts.min)
end

function Wizard:formatTimestamp(ts)
  if not ts then
    return _("—")
  end
  return string.format("%02d/%02d/%04d %02d:%02d", ts.day, ts.month, ts.year, ts.hour, ts.min)
end

function Wizard:buildSummary(pending, err)
  local d = self.data
  local book = d.book
  local lines = {
    _("Dados preenchidos:"),
    "",
    string.format(_("Livro: %s"), book.title),
    string.format(_("Início da leitura: %s"), self:formatTimestamp(d.data_hora_1)),
    string.format(_("Término da leitura: %s"), self:formatTimestamp(d.data_hora_2)),
    string.format(_("Página inicial: %d"), d.numero_1 or 0),
    string.format(_("Página final: %d"), d.numero_2 or 0),
    string.format(_("Total de páginas: %d"), d.numero_3 or 0),
    "",
  }
  if pending >= 0 then
    table.insert(lines, _("✓ Registrado localmente. Sincroniza em segundo plano."))
    if pending > 0 then
      table.insert(lines, string.format(_("Aguardando envio: %d"), pending))
    end
  else
    table.insert(lines, string.format(_("✗ Falha ao registrar: %s"), tostring(err)))
  end
  return table.concat(lines, "\n")
end

function Wizard:abort()
  logger.dbg("[leitura_manual] formulário cancelado")
end

return Wizard