import { Database } from "bun:sqlite";

// Versioned, idempotent migrations for data/leitura.sqlite3 (A.2).
//
// Instead of inline DDL in db/index.ts, every schema/metadata change is a
// named step recorded in the `_migrations` table. Fresh databases run the
// full history; pre-existing databases run only the steps not yet applied.
// Each `up` is defensive (CREATE IF NOT EXISTS / column guards) so it is also
// safe to replay on databases created by the legacy inline DDL.

export interface Migration {
  name: string;
  up: (db: Database) => void;
}

const colunasDaTabela = (db: Database, tabela: string): string[] =>
  (
    db.query(`PRAGMA table_info(${tabela})`).all() as Array<{ name: string }>
  ).map((c) => c.name);

const MIGRATIONS: Migration[] = [
  {
    name: "0001-inicial",
    up(db) {
      db.run(`
        CREATE TABLE IF NOT EXISTS opcao (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          texto   TEXT NOT NULL,
          posicao INTEGER NOT NULL DEFAULT 0
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS leitura (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          tipo        TEXT,
          opcao_id    INTEGER REFERENCES opcao(id),
          op_id       TEXT,
          origem      TEXT NOT NULL DEFAULT 'web',
          data_hora_1 TEXT NOT NULL,
          data_hora_2 TEXT NOT NULL,
          numero_1    INTEGER NOT NULL,
          numero_2    INTEGER NOT NULL,
          numero_3    INTEGER NOT NULL,
          created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      const leituraCols = colunasDaTabela(db, "leitura");
      if (!leituraCols.includes("opcao_id")) {
        db.run(`ALTER TABLE leitura ADD COLUMN opcao_id INTEGER REFERENCES opcao(id)`);
      }
      if (!leituraCols.includes("op_id")) {
        // SQLite cannot ADD COLUMN with UNIQUE; add plain column + unique index.
        db.run(`ALTER TABLE leitura ADD COLUMN op_id TEXT`);
      }
      if (!leituraCols.includes("origem")) {
        db.run(`ALTER TABLE leitura ADD COLUMN origem TEXT NOT NULL DEFAULT 'web'`);
      }
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_leitura_op_id ON leitura(op_id)`);

      const opcaoCols = colunasDaTabela(db, "opcao");
      if (!opcaoCols.includes("md5")) {
        db.run(`ALTER TABLE opcao ADD COLUMN md5 TEXT`);
      }
      if (!opcaoCols.includes("autor")) {
        db.run(`ALTER TABLE opcao ADD COLUMN autor TEXT NOT NULL DEFAULT ''`);
      }
      if (!opcaoCols.includes("imagem")) {
        db.run(`ALTER TABLE opcao ADD COLUMN imagem TEXT NOT NULL DEFAULT ''`);
      }
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_opcao_md5 ON opcao(md5)`);

      if (!leituraCols.includes("md5")) {
        db.run(`ALTER TABLE leitura ADD COLUMN md5 TEXT`);
      }
      if (!leituraCols.includes("leitura_sincronizada")) {
        db.run(`ALTER TABLE leitura ADD COLUMN leitura_sincronizada INTEGER NOT NULL DEFAULT 0`);
      }
      db.run(`CREATE INDEX IF NOT EXISTS idx_leitura_md5 ON leitura(md5)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_leitura_sincronizada ON leitura(leitura_sincronizada)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_leitura_opcao_id ON leitura(opcao_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_leitura_data_hora_1 ON leitura(data_hora_1)`);

      // Backfill opcao_id for records that predate the FK column.
      db.run(`
        UPDATE leitura SET opcao_id = (SELECT id FROM opcao WHERE opcao.texto = leitura.tipo)
        WHERE opcao_id IS NULL
      `);
      // Backfill leitura.md5 from the mapped book (legacy rows).
      db.run(`
        UPDATE leitura SET md5 = (SELECT md5 FROM opcao WHERE opcao.id = leitura.opcao_id)
        WHERE md5 IS NULL
      `);
    },
  },
  {
    name: "0002-remove-campo",
    up(db) {
      // Dead legacy table (A.3) — never referenced by any flow.
      db.run(`DROP TABLE IF EXISTS campo`);
    },
  },
  {
    name: "0003-timestamps-utc",
    up(db) {
      // A.1/C.3: canonical datetimes are "YYYY-MM-DDTHH:MM:SSZ" (UTC).
      // Legacy naive "YYYY-MM-DDTHH:MM" rows keep their wall clock and are
      // relabeled as UTC (migration window; documented in SCHEMAS.md).
      db.run(`
        UPDATE leitura SET data_hora_1 = data_hora_1 || ':00Z'
        WHERE data_hora_1 GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]'
      `);
      db.run(`
        UPDATE leitura SET data_hora_2 = data_hora_2 || ':00Z'
        WHERE data_hora_2 GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]'
      `);

      // E.2/F.1: expose the last stats-affecting edit for plugin re-sync.
      const leituraCols = colunasDaTabela(db, "leitura");
      if (!leituraCols.includes("updated_at")) {
        db.run(`ALTER TABLE leitura ADD COLUMN updated_at TEXT`);
      }
      db.run(`
        UPDATE leitura SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
        WHERE updated_at IS NULL
      `);
    },
  },
  {
    name: "0004-opcao-oculto",
    up(db) {
      // Livros "escondidos" somem da estante, mas seguem nas estatísticas.
      const opcaoCols = colunasDaTabela(db, "opcao");
      if (!opcaoCols.includes("oculto")) {
        db.run(`ALTER TABLE opcao ADD COLUMN oculto INTEGER NOT NULL DEFAULT 0`);
      }
    },
  },
];

// Applies pending migrations inside individual transactions and records each
// applied step in `_migrations`. Idempotent across restarts.
export const runMigrations = (db: Database): void => {
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const applied = new Set(
    (db.query("SELECT name FROM _migrations").all() as Array<{ name: string }>).map(
      (r) => r.name,
    ),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    db.transaction(() => {
      migration.up(db);
      db.run(`INSERT INTO _migrations (name) VALUES (?)`, [migration.name]);
    })();
  }
};