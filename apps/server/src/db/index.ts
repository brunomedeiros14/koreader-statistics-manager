import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { join } from "path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";

const DATA_DIR = process.env.DATA_DIR
  ? process.env.DATA_DIR
  : join(import.meta.dir, "../../../../data");
const DB_PATH = join(DATA_DIR, "leitura.sqlite3");

mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.run("PRAGMA journal_mode = WAL");
sqlite.run("PRAGMA foreign_keys = ON");

const db = drizzle(sqlite);

// ---------------------------------------------------------------------------
// Idempotent schema setup + migrations for pre-existing DBs.
// ---------------------------------------------------------------------------
db.run(sql`
  CREATE TABLE IF NOT EXISTS opcao (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    texto   TEXT NOT NULL,
    posicao INTEGER NOT NULL DEFAULT 0
  )
`);

db.run(sql`
  CREATE TABLE IF NOT EXISTS campo (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    rotulo     TEXT NOT NULL,
    posicao    INTEGER NOT NULL DEFAULT 0,
    habilitado INTEGER NOT NULL DEFAULT 1
  )
`);

db.run(sql`
  CREATE TABLE IF NOT EXISTS leitura (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo        TEXT,
    opcao_id    INTEGER REFERENCES opcao(id),
    op_id       TEXT UNIQUE,
    origem      TEXT NOT NULL DEFAULT 'web',
    data_hora_1 TEXT NOT NULL,
    data_hora_2 TEXT NOT NULL,
    numero_1    INTEGER NOT NULL,
    numero_2    INTEGER NOT NULL,
    numero_3    INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Old schema had only tipo, no opcao_id/op_id/origem.
const leituraCols = (
  db.all(sql`PRAGMA table_info(leitura)`) as Array<{ name: string }>
).map((c) => c.name);

if (!leituraCols.includes("opcao_id")) {
  db.run(sql`ALTER TABLE leitura ADD COLUMN opcao_id INTEGER REFERENCES opcao(id)`);
}
if (!leituraCols.includes("op_id")) {
  // SQLite cannot ADD COLUMN with UNIQUE; add plain column + unique index.
  db.run(sql`ALTER TABLE leitura ADD COLUMN op_id TEXT`);
}
db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_leitura_op_id ON leitura(op_id)`);
if (!leituraCols.includes("origem")) {
  db.run(sql`ALTER TABLE leitura ADD COLUMN origem TEXT NOT NULL DEFAULT 'web'`);
}

const opcaoCols = (db.all(sql`PRAGMA table_info(opcao)`) as Array<{ name: string }>).map(
  (c) => c.name
);
if (!opcaoCols.includes("md5")) {
  db.run(sql`ALTER TABLE opcao ADD COLUMN md5 TEXT`);
}
db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_opcao_md5 ON opcao(md5)`);
if (!leituraCols.includes("md5")) {
  db.run(sql`ALTER TABLE leitura ADD COLUMN md5 TEXT`);
}
if (!leituraCols.includes("leitura_sincronizada")) {
  db.run(sql`ALTER TABLE leitura ADD COLUMN leitura_sincronizada INTEGER NOT NULL DEFAULT 0`);
}

// Backfill opcao_id for records that predate the FK column.
db.run(sql`
  UPDATE leitura SET opcao_id = (SELECT id FROM opcao WHERE opcao.texto = leitura.tipo)
  WHERE opcao_id IS NULL
`);

// Backfill leitura.md5 from the mapped book (legacy rows).
db.run(sql`
  UPDATE leitura SET md5 = (SELECT md5 FROM opcao WHERE opcao.id = leitura.opcao_id)
  WHERE md5 IS NULL
`);

export { db, sqlite };