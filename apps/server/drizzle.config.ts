import { defineConfig, type Config } from "drizzle-kit";

// Config único do drizzle-kit, com o dialeto escolhido por DB_DRIVER — a mesma
// variável usada em runtime por src/db/config.ts. O drizzle-kit gera um dialeto
// por execução, então os scripts db:* rodam este arquivo uma vez por dialeto
// (ver package.json). Schema e migrations continuam separados por dialeto.
const driver =
  (process.env.DB_DRIVER ?? "sqlite").trim().toLowerCase() === "postgres"
    ? "postgres"
    : "sqlite";

// Monta a URL do Postgres a partir das mesmas envs do runtime.
const pgUrl = (): string => {
  const user = process.env.DB_POSTGRES_USER?.trim() || "postgres";
  const password = process.env.DB_POSTGRES_PASSWORD ?? "";
  const host = process.env.DB_POSTGRES_HOST?.trim() || "127.0.0.1";
  const port = process.env.DB_POSTGRES_PORT?.trim() || "5432";
  const db = process.env.DB_POSTGRES_DB?.trim() || "leitura";
  const auth = password ? `${user}:${encodeURIComponent(password)}` : user;
  return `postgres://${auth}@${host}:${port}/${db}`;
};

const config: Config =
  driver === "postgres"
    ? {
        dialect: "postgresql",
        schema: "./src/db/schema/pg.ts",
        out: "./drizzle/pg",
        dbCredentials: { url: process.env.DATABASE_URL?.trim() || pgUrl() },
      }
    : {
        dialect: "sqlite",
        schema: "./src/db/schema/sqlite.ts",
        out: "./drizzle/sqlite",
        dbCredentials: {
          url:
            process.env.DB_SQLITE_PATH?.trim() || "../../data/leitura.sqlite3",
        },
      };

export default defineConfig(config);
