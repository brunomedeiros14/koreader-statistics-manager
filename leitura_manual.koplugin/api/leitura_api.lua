local http = require("socket.http")
local ltn12 = require("ltn12")
local socket = require("socket")
local logger = require("logger")
local socketutil = require("socketutil")
local JSON = require("json")

local SETTING_URL = "leitura_manual_server_url"
local SETTING_TOKEN = "leitura_manual_token"
local DEFAULT_URL = "http://127.0.0.1:3000"

local LeituraApi = {}

function LeituraApi.normalizeUrl(input)
  if not input then return nil end
  local url = tostring(input):gsub("^%s+", ""):gsub("%s+$", "")
  if url == "" then return nil end
  url = url:gsub("/+$", "")
  if not url:match("^https?://") then
    url = "http://" .. url
  end
  return url
end

function LeituraApi.setServerUrl(value)
  local url = LeituraApi.normalizeUrl(value)
  if url then
    G_reader_settings:saveSetting(SETTING_URL, url)
  else
    G_reader_settings:delSetting(SETTING_URL)
  end
  G_reader_settings:flush()
  return url
end

function LeituraApi.getServerUrl()
  return G_reader_settings:readSetting(SETTING_URL) or DEFAULT_URL
end

function LeituraApi.setToken(value)
  local token = tostring(value or ""):gsub("^%s+", ""):gsub("%s+$", "")
  if token == "" then
    G_reader_settings:delSetting(SETTING_TOKEN)
  else
    G_reader_settings:saveSetting(SETTING_TOKEN, token)
  end
  G_reader_settings:flush()
end

function LeituraApi.getToken()
  return G_reader_settings:readSetting(SETTING_TOKEN) or ""
end

-- Raiz da comunicação com o servidor (L.3/B.2): todo request HTTP/JSON passa
-- por aqui — timeout único, cabeçalhos consistentes e token por bearer.
-- Retorna (tabela decodificada, nil) no sucesso ou (nil, erro) na falha.
function LeituraApi.req(method, path, body, timeout)
  local sink = {}
  local request = {
    url = LeituraApi.getServerUrl() .. path,
    method = method,
    sink = ltn12.sink.table(sink),
    headers = { ["accept"] = "application/json" },
  }
  local token = LeituraApi.getToken()
  if token and token ~= "" then
    request.headers["authorization"] = "Bearer " .. token
  end
  if body then
    local ok, encoded = pcall(JSON.encode, body)
    if not ok then return nil, tostring(encoded) end
    request.headers["content-type"] = "application/json"
    request.headers["content-length"] = tostring(#encoded)
    request.source = ltn12.source.string(encoded)
  end

  socketutil:set_timeout(timeout or 5, 10)
  local code, _, status = socket.skip(1, http.request(request))
  socketutil:reset_timeout()

  if type(code) ~= "number" or code < 200 or code >= 300 then
    logger.dbg("[leitura_manual]", method, path, "error:", status or code)
    return nil, tostring(status or code or "network_error")
  end

  local ok_decode, result = pcall(JSON.decode, table.concat(sink))
  if not ok_decode then return nil, "invalid_json" end
  return result or {}, nil
end

function LeituraApi.getOptions()
  return LeituraApi.req("GET", "/api/opcoes")
end

function LeituraApi.submit(payload)
  if not payload or type(payload) ~= "table" then
    return nil, "invalid_payload"
  end
  return LeituraApi.req("POST", "/api/leitura", payload)
end

function LeituraApi.list(page, limit)
  return LeituraApi.req("GET",
    string.format("/api/leitura?page=%d&limit=%d", page or 1, limit or 100))
end

function LeituraApi.remove(id)
  if not id then return nil, "invalid_id" end
  return LeituraApi.req("DELETE", string.format("/api/leitura?id=%d", id))
end

function LeituraApi.listUnsynced(page, limit)
  return LeituraApi.req("GET",
    string.format("/api/leitura?sincronizada=0&page=%d&limit=%d", page or 1, limit or 200))
end

function LeituraApi.patch(id, fields)
  if not id then return nil, "invalid_id" end
  return LeituraApi.req("PATCH", string.format("/api/leitura?id=%d", id), fields or {})
end

function LeituraApi.markSynced(id)
  return LeituraApi.patch(id, { leitura_sincronizada = true })
end

function LeituraApi.markSkipped(id)
  return LeituraApi.patch(id, { leitura_sincronizada = 2 })
end

function LeituraApi.syncBook(payload)
  if not payload or type(payload) ~= "table" then
    return nil, "invalid_payload"
  end
  -- Cover images can be large, so allow a longer round-trip.
  return LeituraApi.req("POST", "/api/livro", payload, 15)
end

return LeituraApi