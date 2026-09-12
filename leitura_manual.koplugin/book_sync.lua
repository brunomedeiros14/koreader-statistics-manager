local _ = require("gettext")
local InfoMessage = require("ui/widget/infomessage")
local UIManager = require("ui/uimanager")
local logger = require("logger")
local DataStorage = require("datastorage")
local CurrentBook = require("current_book")
local LeituraApi = require("leitura_api")

local BookSync = {}

local B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function encodeBase64(data)
  local b = {}
  for i = 1, #data, 3 do
    local a1 = data:byte(i)
    local a2 = data:byte(i + 1)
    local a3 = data:byte(i + 2)
    local n24 = (a1 or 0) * 65536 + (a2 or 0) * 256 + (a3 or 0)
    table.insert(b, B64_CHARS:sub(math.floor(n24 / 262144) % 64 + 1, math.floor(n24 / 262144) % 64 + 1))
    table.insert(b, B64_CHARS:sub(math.floor(n24 / 4096) % 64 + 1, math.floor(n24 / 4096) % 64 + 1))
    if a2 then
      table.insert(b, B64_CHARS:sub(math.floor(n24 / 64) % 64 + 1, math.floor(n24 / 64) % 64 + 1))
    else
      table.insert(b, "=")
    end
    if a3 then
      table.insert(b, B64_CHARS:sub(n24 % 64 + 1, n24 % 64 + 1))
    else
      table.insert(b, "=")
    end
  end
  return table.concat(b)
end

function BookSync.sync(ui)
  local book = CurrentBook.get(ui)
  if not book then
    UIManager:show(InfoMessage:new {
      text = _("Abra um livro para sincronizar."),
    })
    return
  end
  if not book.md5 then
    UIManager:show(InfoMessage:new {
      text = _("Não foi possível obter o md5 (hash) deste livro."),
    })
    return
  end

  local payload = {
    md5 = book.md5,
    titulo = book.titulo,
    autor = book.autor,
    imagem = BookSync.coverBase64(ui and ui.document) or "",
  }

  local result, err = LeituraApi.syncBook(payload)
  if result and result.ok then
    local lines = { _("✓ Livro sincronizado com o servidor.") }
    if result.novo then
      table.insert(lines, _("Livro cadastrado (novo)."))
    else
      table.insert(lines, _("Livro atualizado (já existia)."))
    end
    table.insert(lines, "")
    table.insert(lines, string.format(_("Título: %s"), payload.titulo))
    if payload.autor ~= "" then
      table.insert(lines, string.format(_("Autor: %s"), payload.autor))
    end
    table.insert(lines, string.format(_("md5: %s"), payload.md5))
    if payload.imagem ~= "" then
      table.insert(lines, _("Capa: incluída."))
    else
      table.insert(lines, _("Capa: sem imagem disponível."))
    end
    UIManager:show(InfoMessage:new { text = table.concat(lines, "\n") })
  else
    local lines = { _("✗ Falha ao sincronizar livro.") }
    table.insert(lines, tostring(err or _("erro desconhecido")))
    UIManager:show(InfoMessage:new { text = table.concat(lines, "\n") })
  end
end

function BookSync.coverBase64(doc)
  if not doc or not doc.getCoverPageImage then return nil end
  local img
  local ok_call = pcall(function()
    img = doc:getCoverPageImage()
  end)
  if not ok_call or not img then
    logger.dbg("[leitura_manual] sem capa para o livro atual")
    return nil
  end
  local skip = false
  if img.getWidth and img.getHeight then
    local w, h = img:getWidth(), img:getHeight()
    if not w or not h or w > 4096 or h > 4096 then
      skip = true
      logger.dbg(string.format("[leitura_manual] capa grande demais: %dx%d", w or 0, h or 0))
    end
  end
  if skip then
    img:free()
    return nil
  end

  local path = DataStorage:getSettingsDir() .. "/leitura_manual_cover.png"
  local ok_write = pcall(function()
    img:writePNG(path)
  end)
  img:free()
  if not ok_write then return nil end

  local f = io.open(path, "rb")
  if not f then return nil end
  local data = f:read("*a")
  f:close()
  os.remove(path)
  if not data or data == "" then return nil end

  local ok_b64, encoded = pcall(encodeBase64, data)
  if not ok_b64 then return nil end
  return encoded
end

return BookSync