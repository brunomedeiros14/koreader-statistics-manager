import {
  exportCsvQuerySchema,
  idQuerySchema,
  leituraBodySchema,
  leituraPatchSchema,
  leituraQuerySchema,
  toNumber,
} from "@leitura/common";
import { Elysia } from "elysia";

import {
  criarLeitura,
  editarLeitura,
  excluirLeitura,
  exportarCsv,
  listarLeitura,
} from "../services/leitura.service";

export const leituraRoutes = new Elysia()
  .get(
    "/api/leitura",
    ({ query }) => listarLeitura(query),
    {
      query: leituraQuerySchema,
      detail: {
        summary: "Lista registros com filtros, ordenação e paginação",
        tags: ["Leitura"],
      },
    },
  )
  .get(
    "/api/export.csv",
    ({ query }) => exportarCsv(query),
    {
      query: exportCsvQuerySchema,
      detail: {
        summary: "Exporta registros em CSV (BOM + RFC 4180)",
        tags: ["Leitura"],
      },
    },
  )
  .delete(
    "/api/leitura",
    async ({ query, set }) => {
      const res = await excluirLeitura(toNumber(query.id ?? null, 0));
      if (!res.ok) {
        set.status = res.status ?? 400;
        return { ok: false, error: res.error };
      }
      return res;
    },
    {
      query: idQuerySchema,
      detail: { summary: "Exclui um registro", tags: ["Leitura"] },
    },
  )
  .patch(
    "/api/leitura",
    async ({ query, body, set }) => {
      const res = await editarLeitura(
        toNumber(query.id ?? null, 0),
        body as Record<string, unknown>,
      );
      if (!res.ok) {
        set.status = res.status ?? 400;
        return { ok: false, error: res.error };
      }
      return res;
    },
    {
      query: idQuerySchema,
      body: leituraPatchSchema,
      detail: {
        summary: "Edita um registro (campos parciais)",
        tags: ["Leitura"],
      },
    },
  )
  .post(
    "/api/leitura",
    async ({ body, set }) => {
      const origem = body.origem === "plugin" ? "plugin" : "web";
      const res = await criarLeitura(body, origem);
      if (!res.ok) {
        set.status = res.status ?? 400;
        return { ok: false, error: res.error };
      }
      return res;
    },
    {
      body: leituraBodySchema,
      detail: {
        summary: "Registra uma leitura (idempotente via op_id)",
        tags: ["Leitura"],
      },
    },
  );
