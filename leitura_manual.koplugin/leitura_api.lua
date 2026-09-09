local http = require("socket.http")
local ltn12 = require("ltn12")
local socket = require("socket")
local logger = require("logger")
local socketutil = require("socketutil")
local JSON = require("json")

local SETTING_URL = "leitura_manual_server_url"
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

function LeituraApi.getOptions()
  local sink = {}
  local request = {
    url = LeituraApi.getServerUrl() .. "/api/opcoes",
    method = "GET",
    sink = ltn12.sink.table(sink),
    headers = { ["accept"] = "application/json" },
  }
  socketutil:set_timeout(5, 10)
  local code, _, status = socket.skip(1, http.request(request))
  socketutil:reset_timeout()

  if type(code) ~= "number" or code < 200 or code >= 300 then
    logger.dbg("[leitura_manual] getOptions error:", status or code)
    return nil, tostring(status or code or "network_error")
  end

  local ok, result = pcall(JSON.decode, table.concat(sink))
  if not ok then return nil, "invalid_json" end
  return result or {}
end

function LeituraApi.submit(payload)
  if not payload or type(payload) ~= "table" then
    return nil, "invalid_payload"
  end
  local ok, body = pcall(JSON.encode, payload)
  if not ok then return nil, tostring(body) end

  local sink = {}
  local request = {
    url = LeituraApi.getServerUrl() .. "/api/leitura",
    method = "POST",
    sink = ltn12.sink.table(sink),
    headers = {
      ["accept"] = "application/json",
      ["content-type"] = "application/json",
      ["content-length"] = tostring(#body),
    },
    source = ltn12.source.string(body),
  }
  socketutil:set_timeout(5, 10)
  local code, _, status = socket.skip(1, http.request(request))
  socketutil:reset_timeout()

  if type(code) ~= "number" or code < 200 or code >= 300 then
    logger.dbg("[leitura_manual] submit error:", status or code)
    return nil, tostring(status or code or "network_error")
  end

  local ok, result = pcall(JSON.decode, table.concat(sink))
  if not ok then return nil, "invalid_json" end
  return result or {}, nil
end

function LeituraApi.list(page, limit)
  page = page or 1
  limit = limit or 100
  local sink = {}
  local request = {
    url = string.format("%s/api/leitura?page=%d&limit=%d", LeituraApi.getServerUrl(), page, limit),
    method = "GET",
    sink = ltn12.sink.table(sink),
    headers = { ["accept"] = "application/json" },
  }
  socketutil:set_timeout(5, 10)
  local code, _, status = socket.skip(1, http.request(request))
  socketutil:reset_timeout()

  if type(code) ~= "number" or code < 200 or code >= 300 then
    logger.dbg("[leitura_manual] list error:", status or code)
    return nil, tostring(status or code or "network_error")
  end

  local ok, result = pcall(JSON.decode, table.concat(sink))
  if not ok then return nil, "invalid_json" end
  return result or {}, nil
end

function LeituraApi.remove(id)
  if not id then return nil, "invalid_id" end
  local sink = {}
  local request = {
    url = string.format("%s/api/leitura?id=%d", LeituraApi.getServerUrl(), id),
    method = "DELETE",
    sink = ltn12.sink.table(sink),
    headers = { ["accept"] = "application/json" },
  }
  socketutil:set_timeout(5, 10)
  local code, _, status = socket.skip(1, http.request(request))
  socketutil:reset_timeout()

  if type(code) ~= "number" or code < 200 or code >= 300 then
    logger.dbg("[leitura_manual] remove error:", status or code)
    return nil, tostring(status or code or "network_error")
  end

  local ok, result = pcall(JSON.decode, table.concat(sink))
  if not ok then return nil, "invalid_json" end
  return result or {}, nil
end

function LeituraApi.listUnsynced(page, limit)
  page = page or 1
  limit = limit or 200
  local sink = {}
  local request = {
    url = string.format("%s/api/leitura?sincronizada=0&page=%d&limit=%d",
      LeituraApi.getServerUrl(), page, limit),
    method = "GET",
    sink = ltn12.sink.table(sink),
    headers = { ["accept"] = "application/json" },
  }
  socketutil:set_timeout(5, 10)
  local code, _, status = socket.skip(1, http.request(request))
  socketutil:reset_timeout()

  if type(code) ~= "number" or code < 200 or code >= 300 then
    logger.dbg("[leitura_manual] listUnsynced error:", status or code)
    return nil, tostring(status or code or "network_error")
  end

  local ok, result = pcall(JSON.decode, table.concat(sink))
  if not ok then return nil, "invalid_json" end
  return result or {}, nil
end

function LeituraApi.patch(id, fields)
  if not id then return nil, "invalid_id" end
  local ok_body, payload = pcall(JSON.encode, fields or {})
  if not ok_body then return nil, "invalid_payload" end
  local sink = {}
  local request = {
    url = string.format("%s/api/leitura?id=%d", LeituraApi.getServerUrl(), id),
    method = "PATCH",
    sink = ltn12.sink.table(sink),
    headers = {
      ["accept"] = "application/json",
      ["content-type"] = "application/json",
      ["content-length"] = tostring(#payload),
    },
    source = ltn12.source.string(payload),
  }
  socketutil:set_timeout(5, 10)
  local code, _, status = socket.skip(1, http.request(request))
  socketutil:reset_timeout()

  if type(code) ~= "number" or code < 200 or code >= 300 then
    logger.dbg("[leitura_manual] patch error:", status or code)
    return nil, tostring(status or code or "network_error")
  end

  local ok, result = pcall(JSON.decode, table.concat(sink))
  if not ok then return nil, "invalid_json" end
  return result or {}, nil
end

function LeituraApi.markSynced(id)
  return LeituraApi.patch(id, { leitura_sincronizada = true })
end

function LeituraApi.markSkipped(id)
  return LeituraApi.patch(id, { leitura_sincronizada = 2 })
end

return LeituraApi