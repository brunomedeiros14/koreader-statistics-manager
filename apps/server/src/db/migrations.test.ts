import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import * as schema from "./schema/sqlite";

// Migrations geradas pelo drizzle-kit ficam em apps/server/drizzle/sqlite.
const MIGRATIONS = join(import.meta.dir, "../../drizzle/sqlite");

const abrir = () => {
  const dir = mkdtempSync(join(tmpdir(), "leitura-mig-"));
  const sqlite = new Database(join(dir, "test.sqlite3"));
  return { sqlite, db: drizzle(sqlite, { schema }) };
};

const tabelas = (sqlite: Database): string[] =>
  (
    sqlite
      .query(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as Array<{ name: string }>
  ).map((t) => t.name);

describe("migrations (drizzle-kit)", () => {
  it("cria o schema completo em um banco novo", () => {
    const { sqlite, db } = abrir();
    migrate(db, { migrationsFolder: MIGRATIONS });
    const nomes = tabelas(sqlite);
    expect(nomes).toContain("opcao");
    expect(nomes).toContain("leitura");

    const colunas = (
      sqlite.query(`PRAGMA table_info(leitura)`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    expect(colunas).toEqual(
      expect.arrayContaining([
        "opcao_id",
        "op_id",
        "data_hora_1",
        "data_hora_2",
        "leitura_sincronizada",
        "updated_at",
      ]),
    );
  });

  it("é idempotente e registra as versões aplicadas", () => {
    const { sqlite, db } = abrir();
    migrate(db, { migrationsFolder: MIGRATIONS });
    migrate(db, { migrationsFolder: MIGRATIONS });
    const aplicadas = sqlite
      .query("SELECT count(*) AS n FROM __drizzle_migrations")
      .get() as { n: number };
    expect(aplicadas.n).toBe(1);
  });

  it("adota banco sem controle de migrations (baseline idempotente)", () => {
    const { sqlite, db } = abrir();
    migrate(db, { migrationsFolder: MIGRATIONS });
    // Simula um banco criado pelo runner manual antigo: schema pronto, mas sem
    // o journal do drizzle. O baseline usa IF NOT EXISTS e não deve falhar.
    sqlite.run("DROP TABLE __drizzle_migrations");
    expect(() => migrate(db, { migrationsFolder: MIGRATIONS })).not.toThrow();
  });
});
