local _ = require("gettext")
local ConfirmBox = require("ui/widget/confirmbox")
local InfoMessage = require("ui/widget/infomessage")
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")
local socket = require("socket")
local socketutil = require("socketutil")
local http = require("socket.http")
local ltn12 = require("ltn12")
local JSON = require("json")
local LeituraApi = require("leitura_api")

local Updater = {}

-- Returns true if `candidate` is strictly newer than `current` (semver, optional "v" prefix).
function Updater.isNewer(candidate, current)
  local function parse(v)
    if type(v) ~= "string" then return nil end
    local a, b, c = v:match("^v?(%d+)%.(%d+)%.(%d+)")
    if not a then return nil end
    return { tonumber(a), tonumber(b), tonumber(c) }
  end
  local c = parse(candidate)
  local cur = parse(current)
  if not c or not cur then return false end
  if c[1] ~= cur[1] then return c[1] > cur[1] end
  if c[2] ~= cur[2] then return c[2] > cur[2] end
  return c[3] > cur[3]
end

-- Wraps a path in POSIX single quotes, escaping any embedded single quotes.
local function sq(path)
  return "'" .. tostring(path):gsub("'", "'\\''") .. "'"
end

Updater.getManifest = function()
  local sink = {}
  local request = {
    url = LeituraApi.getServerUrl() .. "/api/plugin",
    method = "GET",
    sink = ltn12.sink.table(sink),
    headers = { ["accept"] = "application/json" },
  }
  socketutil:set_timeout(5, 10)
  local code, _, status = socket.skip(1, http.request(request))
  socketutil:reset_timeout()

  if type(code) ~= "number" or code < 200 or code >= 300 then
    logger.dbg("[leitura_manual] getManifest error:", status or code)
    return nil, tostring(status or code or "network_error")
  end

  local ok, result = pcall(JSON.decode, table.concat(sink))
  if not ok then return nil, "invalid_json" end
  return result or {}
end

Updater.downloadZip = function(dest)
  local url = LeituraApi.getServerUrl() .. "/api/plugin/download"
  local f = io.open(dest, "wb")
  if not f then
    return nil, string.format(_("sem permissão para escrever em %s"), dest)
  end

  local request = {
    url = url,
    method = "GET",
    sink = ltn12.sink.file(f),
  }
  socketutil:set_timeout(10, 30)
  local ok_req, code, _, status = pcall(socket.skip, 1, http.request(request))
  socketutil:reset_timeout()
  pcall(f.close, f)

  if not ok_req then
    os.remove(dest)
    return nil, tostring(code or "network_error")
  end
  if type(code) ~= "number" or code < 200 or code >= 300 then
    os.remove(dest)
    return nil, tostring(status or code or "network_error")
  end
  if (lfs.attributes(dest, "size") or 0) == 0 then
    os.remove(dest)
    return nil, _("pacote vazio baixado")
  end
  return true
end

-- Extracts every entry of `zip_path` into `staging`.
-- Prefers KOReader's `ffi/archiver`; falls back to `Device:unpackArchive` for
-- builds that predate the module. Returns true, or nil + error string.
Updater.unpackZip = function(zip_path, staging)
  local has_archiver, Archiver = pcall(require, "ffi/archiver")
  if has_archiver and type(Archiver) == "table" and Archiver.Reader then
    if not lfs.mkdir(staging) and lfs.attributes(staging, "mode") ~= "directory" then
      return nil, _("não foi possível criar o diretório temporário")
    end

    local arc = Archiver.Reader:new()
    if not arc:open(zip_path) then
      local open_err = arc.err
      arc:close()
      return nil, tostring(open_err or _("falha ao abrir o pacote de atualização"))
    end
    for entry in arc:iterate() do
      if not arc:extractToPath(entry.path, staging .. "/" .. entry.path) then
        break
      end
    end
    local err = arc.err
    arc:close()
    if err then return nil, tostring(err) end
    return true
  end

  local Device = require("device")
  if type(Device.unpackArchive) ~= "function" then
    return nil, _("este KOReader não oferece extração de pacotes")
  end
  if not lfs.mkdir(staging) and lfs.attributes(staging, "mode") ~= "directory" then
    return nil, _("não foi possível criar o diretório temporário")
  end
  local ok, unpack_err = Device:unpackArchive(zip_path, staging, true)
  if not ok then
    return nil, tostring(unpack_err or _("falha na extração do pacote"))
  end
  return true
end

-- Downloads the plugin zip and atomically replaces `plugin_dir`.
--
-- Strategy: extract into a staging directory, backup the current plugin dir,
-- rename the new one into place, then clean up. On any failure after the
-- backup the original is restored so the plugin always stays usable.
Updater.apply = function(plugin_dir)
  local dir = plugin_dir:gsub("/+$", "")
  local parent_dir = dir:match("^(.*)/[^/]+$")
  local plugin_name = dir:match("([^/]+)$")

  if not parent_dir or parent_dir == "" or not plugin_name then
    return nil, _("não foi possível determinar o diretório do plugin")
  end

  local tmp_zip = parent_dir .. "/" .. plugin_name .. "-update.zip"
  local staging = parent_dir .. "/" .. plugin_name .. "-staging"
  local backup  = parent_dir .. "/" .. plugin_name .. "-bak"

  -- Remove leftovers from a previous failed attempt.
  os.execute("rm -rf " .. sq(tmp_zip) .. " " .. sq(staging))

  local ok, err = Updater.downloadZip(tmp_zip)
  if not ok then
    os.remove(tmp_zip)
    return nil, string.format(_("falha no download: %s"), tostring(err or _("erro desconhecido")))
  end

  ok, err = Updater.unpackZip(tmp_zip, staging)
  os.remove(tmp_zip)
  if not ok then
    os.execute("rm -rf " .. sq(staging))
    return nil, string.format(_("falha na extração: %s"), tostring(err or _("erro desconhecido")))
  end

  -- The zip contains the plugin files at its root; check the expected file.
  if lfs.attributes(staging .. "/main.lua", "mode") ~= "file" then
    os.execute("rm -rf " .. sq(staging))
    return nil, _("o pacote de atualização não contém o plugin esperado")
  end

  -- Atomic-ish swap (all paths share the same filesystem):
  --   1. backup current plugin
  --   2. move new plugin into place
  --   3. clean up backup and staging
  os.execute("rm -rf " .. sq(backup))
  if not os.rename(dir, backup) then
    os.execute("rm -rf " .. sq(staging))
    return nil, _("falha ao criar o backup do plugin atual")
  end
  if not os.rename(staging, dir) then
    -- Restore backup so the plugin remains usable.
    os.rename(backup, dir)
    os.execute("rm -rf " .. sq(staging))
    return nil, _("falha ao instalar a nova versão")
  end

  os.execute("rm -rf " .. sq(backup))
  return true
end

-- Menu-facing flow: read the local version, ask the server for the latest and
-- offer to download & install when a newer one is available.
Updater.check = function(plugin)
  local local_v = plugin.PLUGIN_VERSION or "0.0.0"
  local data, err = Updater.getManifest()
  if not data then
    UIManager:show(InfoMessage:new {
      text = string.format(_("Falha ao verificar atualização:\n%s"), tostring(err or _("erro de rede"))),
    })
    return
  end

  local remote_v = data.versao or "0.0.0"
  if not Updater.isNewer(remote_v, local_v) then
    UIManager:show(InfoMessage:new {
      text = string.format(_("Plugin na versão mais recente (v%s)."), local_v),
    })
    return
  end

  UIManager:show(ConfirmBox:new {
    text = string.format(_("Atualização disponível: v%s → v%s\n\nDeseja baixar e instalar?"), local_v, remote_v),
    ok_text = _("Baixar e instalar"),
    cancel_text = _("Cancelar"),
    ok_callback = function()
      Updater.install(plugin, remote_v)
    end,
  })
end

Updater.install = function(plugin, new_version)
  local dir = plugin.path
  if not dir or dir == "" then
    UIManager:show(InfoMessage:new {
      text = _("Caminho do plugin não encontrado."),
    })
    return
  end

  UIManager:show(InfoMessage:new {
    text = string.format(_("Baixando atualização v%s…"), new_version),
  })
  UIManager:forceRePaint()

  local ok, err = Updater.apply(dir)
  if not ok then
    UIManager:show(InfoMessage:new {
      text = string.format(_("Falha ao atualizar:\n%s"), tostring(err or _("erro desconhecido"))),
    })
    return
  end

  UIManager:show(ConfirmBox:new {
    text = string.format(_("Plugin atualizado para v%s.\nReinicie o KOReader para aplicar as mudanças."), new_version),
    ok_text = _("Reiniciar agora"),
    cancel_text = _("Depois"),
    ok_callback = function()
      -- Exit code 85 triggers an app restart on most platforms.
      UIManager:quit(UIManager.RETURN_CODE_REBOOT or 85)
    end,
  })
end

return Updater