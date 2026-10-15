import { join } from "path";

// Configuração de banco por variáveis de ambiente. Um único código roda com
// SQLite (desenvolvimento local) ou Postgres (produção), decidido por
// DB_DRIVER. Nenhum outro módulo deve ler process.env de banco diretamente —
// tudo passa por aqui, para manter um só ponto de verdade.

export type Driver = "sqlite" | "postgres";

const intEnv = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
};

const driverRaw = (process.env.DB_DRIVER ?? "sqlite").trim().toLowerCase();
export const DB_DRIVER: Driver =
  driverRaw === "postgres" ? "postgres" : "sqlite";

// Base padrão do filesystem de dados (independente do cwd), preservando o
// layout histórico <repo>/data (montado em /app/data no Docker).
export const DATA_PADRAO = join(import.meta.dir, "../../../../data");

// Caminho do arquivo SQLite. Só é usado quando DB_DRIVER=sqlite.
export const DB_SQLITE_PATH =
  process.env.DB_SQLITE_PATH?.trim() || join(DATA_PADRAO, "leitura.sqlite3");
console.log(`DB_SQLITE_PATH=${process.env.DB_SQLITE_PATH}`);
// Conexão Postgres. Só usada quando DB_DRIVER=postgres.
export const DB_POSTGRES = {
  host: process.env.DB_POSTGRES_HOST?.trim() || "127.0.0.1",
  port: intEnv(process.env.DB_POSTGRES_PORT, 5432),
  user: process.env.DB_POSTGRES_USER?.trim() || "postgres",
  password: process.env.DB_POSTGRES_PASSWORD ?? "",
  database: process.env.DB_POSTGRES_DB?.trim() || "leitura",
} as const;
