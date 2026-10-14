import type { Pool } from "pg";

// Migrations versionadas e idempotentes para Postgres (produção). Diferente do
// SQLite, este histórico parte de um banco novo, então a versão inicial já
// cria o schema final. Cada passo é registrado em `_migrations` (mesma tabela
// de controle usada pelo dialeto SQLite).

interface PgMigration {
  name: string;
  statements: string[];
}

const PG_MIGRATIONS: PgMigration[] = [
  {
    name: "0001-inicial",
    statements: [
      `CREATE TABLE IF NOT EXISTS opcao (
        id      SERIAL PRIMARY KEY,
        texto   TEXT NOT NULL,
        autor   TEXT NOT NULL DEFAULT '',
        imagem  TEXT NOT NULL DEFAULT '',
        md5     TEXT,
        posicao INTEGER NOT NULL DEFAULT 0,
        oculto  BOOLEAN NOT NULL DEFAULT false
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_opcao_md5 ON opcao(md5)`,
      `CREATE TABLE IF NOT EXISTS leitura (
        id                   SERIAL PRIMARY KEY,
        tipo                 TEXT,
        opcao_id             INTEGER REFERENCES opcao(id),
        op_id                TEXT,
        origem               TEXT NOT NULL DEFAULT 'web',
        data_hora_1          TEXT NOT NULL,
        data_hora_2          TEXT NOT NULL,
        numero_1             INTEGER NOT NULL,
        numero_2             INTEGER NOT NULL,
        numero_3             INTEGER NOT NULL,
        md5                  TEXT,
        leitura_sincronizada INTEGER NOT NULL DEFAULT 0,
        created_at           TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        updated_at           TEXT
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_leitura_op_id ON leitura(op_id)`,
      `CREATE INDEX IF NOT EXISTS idx_leitura_opcao_id ON leitura(opcao_id)`,
      `CREATE INDEX IF NOT EXISTS idx_leitura_data_hora_1 ON leitura(data_hora_1)`,
      `CREATE INDEX IF NOT EXISTS idx_leitura_md5 ON leitura(md5)`,
      `CREATE INDEX IF NOT EXISTS idx_leitura_sincronizada ON leitura(leitura_sincronizada)`,
    ],
  },
];

export const runMigrationsPg = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS _migrations (
        name       TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )`,
    );
    const applied = new Set(
      (
        await client.query<{ name: string }>("SELECT name FROM _migrations")
      ).rows.map((r) => r.name),
    );
    for (const migration of PG_MIGRATIONS) {
      if (applied.has(migration.name)) continue;
      await client.query("BEGIN");
      try {
        for (const statement of migration.statements) {
          await client.query(statement);
        }
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [
          migration.name,
        ]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
};
