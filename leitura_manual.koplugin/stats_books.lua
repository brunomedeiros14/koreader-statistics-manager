local _ = require("gettext")
local SQ3 = require("lua-ljsqlite3/init")
local DataStorage = require("datastorage")
local logger = require("logger")

local STATS_DB_PATH = DataStorage:getSettingsDir() .. "/statistics.sqlite3"

local StatsBooks = {}

function StatsBooks.getStatsDbPath()
  return STATS_DB_PATH
end

function StatsBooks.openStatsDb()
  local db = SQ3.open(STATS_DB_PATH)
  if not db then
    logger.warn("[leitura_manual] StatsBooks: falha ao abrir", STATS_DB_PATH)
    return nil
  end
  return db
end

-- Lists books with an md5 from statistics.sqlite3, ordered by most recent
-- reading (page_stat_data.start_time, falling back to book.last_open).
-- Returns array of { id, title, md5, last_read }.
function StatsBooks.list()
  local db = StatsBooks.openStatsDb()
  if not db then return {} end

  local stmt = db:prepare([[
    SELECT b.id AS id,
           COALESCE(b.title, '') AS title,
           COALESCE(b.md5, '') AS md5,
           COALESCE(MAX(p.start_time), b.last_open, 0) AS last_read
    FROM book b
    LEFT JOIN page_stat_data p ON p.id_book = b.id
    WHERE COALESCE(b.md5, '') != ''
    GROUP BY b.id
    ORDER BY last_read DESC
  ]])
  if not stmt then
    logger.warn("[leitura_manual] StatsBooks: falha ao preparar consulta")
    db:close()
    return {}
  end

  local books = {}
  local res, nb = stmt:resultset("i")
  if res and nb and nb > 0 then
    for i = 1, nb do
      local id = tonumber(res[1][i])
      local title = tostring(res[2][i] or "")
      local md5 = tostring(res[3][i] or "")
      local last_read = tonumber(res[4][i]) or 0
      if id and md5 ~= "" and title ~= "" then
        table.insert(books, {
          id = id,
          title = title,
          md5 = md5,
          last_read = last_read,
        })
      end
    end
  end
  stmt:close()
  db:close()
  return books
end

function StatsBooks.formatLastRead(book)
  if not book or not book.last_read or book.last_read <= 0 then
    return _("última leitura: desconhecida")
  end
  return string.format(_("última leitura: %s"), os.date("%d/%m/%Y %H:%M", book.last_read))
end

return StatsBooks