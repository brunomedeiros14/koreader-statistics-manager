import { DB_DRIVER } from "./config";
import type { Repo } from "./types";

export type { Repo } from "./types";

// Seleciona o adaptador conforme DB_DRIVER. O import dinâmico evita carregar
// bun:sqlite quando rodando em Postgres (e vice-versa).
export const criarRepo = async (): Promise<Repo> => {
  if (DB_DRIVER === "postgres") {
    const { criarRepoPostgres } = await import("./postgres");
    return criarRepoPostgres();
  }
  const { criarRepoSqlite } = await import("./sqlite");
  return criarRepoSqlite();
};

// Instância única de persistência, resolvida uma vez no carregamento do módulo
// (top-level await). Services e rotas consomem apenas `repo`.
export const repo: Repo = await criarRepo();
