local DateTime = {}

-- Único lugar que interpreta timestamps no plugin (L.3/A.1). Formatos aceitos:
--   "YYYY-MM-DDTHH:MM"          legado, interpretado como relógio local
--   "YYYY-MM-DDTHH:MM:SSZ"      canônico UTC (o que a API emite hoje)
-- Tudo é convertido para epoch (segundos Unix), a unidade natural para
-- os.time/difftime e para statistics.sqlite3.

-- Tabela {year, month, day, hour, min, sec} (relógio local) -> epoch.
function DateTime.localToUnix(ts)
  if not ts then return nil end
  local ok, t = pcall(os.time, {
    year = tonumber(ts.year) or 0,
    month = tonumber(ts.month) or 0,
    day = tonumber(ts.day) or 0,
    hour = tonumber(ts.hour) or 0,
    min = tonumber(ts.min) or 0,
    sec = tonumber(ts.sec) or 0,
  })
  if not ok or t == nil then return nil end
  return t
end

-- Componentes de data/hora que representam um instante UTC -> epoch.
-- os.time interpreta os campos como relógio local; medimos o deslocamento do
-- fuso naquele mesmo relógio e invertemos (robusto a horário de verão).
local function utcComponentsToUnix(t)
  local t_local = os.time(t)
  local offset = os.time(os.date("!*t", t_local)) - t_local
  return t_local - offset
end

-- Componentes de data/hora (relógio local) -> string UTC canônica
-- "YYYY-MM-DDTHH:MM:SSZ".
function DateTime.toUtcIso(ts)
  local localUnix = DateTime.localToUnix(ts)
  if not localUnix then return nil end
  local utc = os.date("!*t", localUnix)
  return string.format("%04d-%02d-%02dT%02d:%02d:%02dZ",
    utc.year, utc.month, utc.day, utc.hour, utc.min, utc.sec)
end

-- ISO (canônico UTC ou legado local) -> epoch de segundos Unix.
function DateTime.parseIsoToUnix(iso)
  if type(iso) ~= "string" then return nil end
  local y, mo, d, h, mi, s = iso:match("^(%d%d%d%d)-(%d%d)-(%d%d)T(%d%d):(%d%d):(%d%d)Z$")
  if y then
    return utcComponentsToUnix{
      year = tonumber(y), month = tonumber(mo), day = tonumber(d),
      hour = tonumber(h), min = tonumber(mi), sec = tonumber(s),
    }
  end
  local y2, mo2, d2, h2, mi2 = iso:match("^(%d%d%d%d)-(%d%d)-(%d%d)T(%d%d):(%d%d)$")
  if y2 then
    return DateTime.localToUnix{
      year = tonumber(y2), month = tonumber(mo2), day = tonumber(d2),
      hour = tonumber(h2), min = tonumber(mi2), sec = 0,
    }
  end
  return nil
end

return DateTime