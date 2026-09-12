local _ = require("gettext")
local util = require("util")
local ReaderUI = require("apps/reader/readerui")

local CurrentBook = {}

local function basename(path)
  if not path then return nil end
  local name = tostring(path):gsub(".*[/\\]", "")
  name = name:gsub("%.%a+$", "")
  if name == "" then name = tostring(path) end
  return name
end

-- If a reader is currently open, returns { md5, titulo, autor } for that
-- book, otherwise nil. md5 comes from the same source the statistics use
-- (partial_md5_checksum), computed from the file when not stored yet.
function CurrentBook.get(ui)
  if not ui then
    ui = ReaderUI.instance
  end
  if not ui then return nil end
  local props = {}
  if ui.doc_props and type(ui.doc_props) == "table" then
    for k, v in pairs(ui.doc_props) do
      props[k] = v
    end
  end
  if ui.document and ui.document.getProps then
    local ok, extra = pcall(ui.document.getProps, ui.document)
    if ok and type(extra) == "table" then
      for k, v in pairs(extra) do
        if props[k] == nil then
          props[k] = v
        end
      end
    end
  end

  local md5 = props.md5
  if (not md5 or md5 == "") and ui.doc_settings and ui.doc_settings.readSetting then
    local ok, stored = pcall(function()
      return ui.doc_settings:readSetting("partial_md5_checksum")
    end)
    if ok and stored and stored ~= "" then
      md5 = stored
    end
  end
  if (not md5 or md5 == "") and ui.document and ui.document.file then
    local ok, computed = pcall(util.partialMD5, ui.document.file)
    if ok and computed then
      md5 = computed
    end
  end

  local titulo = props.title
  if not titulo or titulo == "" then
    local file = props.file or (ui.document and ui.document.file)
    titulo = props.titulo or basename(file) or _("Sem título")
  end

  local autor = props.authors
  if type(autor) == "table" then
    autor = table.concat(autor, ", ")
  end

  return {
    md5 = md5 and tostring(md5):lower() or nil,
    titulo = tostring(titulo),
    autor = tostring(autor or ""),
  }
end

function CurrentBook.hasReader()
  return ReaderUI.instance ~= nil
end

return CurrentBook