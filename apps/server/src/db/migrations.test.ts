import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { runMigrations } from "./migrations/sqlite";

// Simulates a pre-A.1 legacy database: naive datetimes without seconds/Z,
// plus the obsolete `campo` table. After runMigrations the datetimes must be
// canonical UTC and `campo` gone.
const criarBancoLegado = (): Database => {
  const dir = mkdtempSync(join(tmpdir(), "leitura-mig-"));
  const db = new Database(join(dir, "test.sqlite3"));
  db.run(`
    CREATE TABLE campo (id INTEGER PRIMARY KEY, texto TEXT NOT NULL)
  `);
  db.run(`
    CREATE TABLE leitura (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT,
      opcao_id INTEGER,
      op_id TEXT,
      origem TEXT NOT NULL DEFAULT 'web',
      data_hora_1 TEXT NOT NULL,
      data_hora_2 TEXT NOT NULL,
      numero_1 INTEGER NOT NULL,
      numero_2 INTEGER NOT NULL,
      numero_3 INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      md5 TEXT,
      leitura_sincronizada INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`
    INSERT INTO leitura (data_hora_1, data_hora_2, numero_1, numero_2, numero_3)
    VALUES ('2026-09-09T08:00', '2026-09-09T09:30', 1, 20, 300)
  `);
  return db;
};

describe("runMigrations", () => {
  it("converte datetimes legados para canônico UTC (A.1)", () => {
    const db = criarBancoLegado();
    runMigrations(db);
    const row = db.query("SELECT data_hora_1, data_hora_2 FROM leitura").get() as {
      data_hora_1: string;
      data_hora_2: string;
    };
    expect(row.data_hora_1).toBe("2026-09-09T08:00:00Z");
    expect(row.data_hora_2).toBe("2026-09-09T09:30:00Z");
  });

  it("remove a tabela órfã campo (A.3)", () => {
    const db = criarBancoLegado();
    runMigrations(db);
    const tabelas = (db.query(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>).map((t) => t.name);
    expect(tabelas).toContain("leitura");
    expect(tabelas).not.toContain("campo");
  });

  it("preenche updated_at a partir de created_at (E.2)", () => {
    const db = criarBancoLegado();
    runMigrations(db);
    const row = db.query("SELECT created_at, updated_at FROM leitura").get() as {
      created_at: string;
      updated_at: string | null;
    };
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("é idempotente e registra as versões em _migrations", () => {
    const db = criarBancoLegado();
    runMigrations(db);
    runMigrations(db);
    const versoes = db.query("SELECT name FROM _migrations ORDER BY name").all() as Array<{ name: string }>;
    expect(versoes.map((v) => v.name)).toEqual([
      "0001-inicial",
      "0002-remove-campo",
      "0003-timestamps-utc",
      "0004-opcao-oculto",
    ]);
  });
});