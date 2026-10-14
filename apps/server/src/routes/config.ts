import {
  configBodySchema,
  livroBodySchema,
  type LivroConfigItem,
} from "@leitura/common";
import { Elysia } from "elysia";

import { limparCapasOrfas } from "../covers";
import { listarLivros, salvarConfig, upsertLivro } from "../services/livros.service";

export const configRoutes = new Elysia()
  .get(
    "/api/opcoes",
    async () => ({ livros: await listarLivros() }),
    { detail: { summary: "Lista livros mapeados", tags: ["Configuração"] } },
  )
  .get(
    "/api/config",
    async () => ({ livros: await listarLivros() }),
    { detail: { summary: "Lê a configuração atual", tags: ["Configuração"] } },
  )
  .post(
    "/api/config",
    async ({ body, set }) => {
      const res = await salvarConfig(body.livros as LivroConfigItem[] | undefined);
      if (!res.ok) {
        set.status = 500;
        return { ok: false, error: res.error };
      }

      // Drop cover files no longer referenced by any book row.
      limparCapasOrfas(res.livros.map((r) => r.imagem ?? ""));

      return { ok: true, livros: res.livros };
    },
    {
      body: configBodySchema,
      detail: {
        summary: "Salva a lista de livros mapeados",
        tags: ["Configuração"],
      },
    },
  )
  .post(
    "/api/livro",
    async ({ body, set }) => {
      const res = await upsertLivro(body);
      if (!res.ok) {
        set.status = res.status ?? 400;
        return { ok: false, error: res.error };
      }
      return res;
    },
    {
      body: livroBodySchema,
      detail: {
        summary: "Sincroniza um livro (idempotente via md5)",
        tags: ["Configuração"],
      },
    },
  );
