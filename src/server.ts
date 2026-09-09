import { openapi } from "@elysia/openapi";
import { and, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { join } from "path";

import { db } from "./db";
import { leitura, opcao, type LeituraInsert } from "./db/schema";
import {
  toNumber,
  validatePayload,
  validatePayloadPatch,
  type PatchValues,
  type PayloadValues,
} from "./validation";

const PORT = Number(process.env.PORT ?? 3000);

const csvCell = (value: unknown): string => {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};

const toCsv = (headers: string[], rows: Array<Array<unknown>>): string =>
  [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join(
    "\r\n",
  );

const serveHtml = async (name: string): Promise<Response> => {
  const file = Bun.file(join(import.meta.dir, name));
  return new Response(await file.text(), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

const bodyLeitura = t.Object({
  op_id: t.Optional(t.String()),
  md5: t.String({ minLength: 1 }),
  titulo: t.Optional(t.String()),
  data_hora_1: t.String(),
  data_hora_2: t.String(),
  numero_1: t.Integer({ minimum: 0 }),
  numero_2: t.Integer({ minimum: 0 }),
  numero_3: t.Integer({ minimum: 0 }),
  origem: t.Optional(t.String()),
  leitura_sincronizada: t.Optional(
    t.Union([t.Boolean(), t.Integer({ minimum: 0, maximum: 2 })]),
  ),
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// drizzle/bun-sqlite types .run() as void but returns { changes, lastInsertRowid }.
type SqlRunResult = { changes: number; lastInsertRowid: number };
const runRows = (result: unknown): SqlRunResult => result as SqlRunResult;

const app = new Elysia()
  .use(
    openapi({
      path: "/openapi",
      documentation: {
        info: {
          title: "Leitura Manual API",
          version: "1.0.0",
          description: "API do plugin Leitura Manual (provisório).",
        },
      },
    }),
  )
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION" || code === "PARSE") {
      set.status = 400;
      let detail = "";
      if (code === "VALIDATION" && error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message) as { summary?: unknown };
          if (typeof parsed?.summary === "string") detail = parsed.summary;
        } catch {
          detail = "";
        }
      }
      return {
        ok: false,
        error:
          detail ||
          (code === "PARSE" ? "Dados inválidos" : "Requisição inválida"),
      };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found" };
    }
    set.status = 500;
    return { ok: false, error: errorMessage(error) };
  })

  // --- HTML pages ----------------------------------------------------------
  .get("/", () => serveHtml("view/form.html"), { detail: { hide: true } })
  .get("/registros", () => serveHtml("view/registros.html"), {
    detail: { hide: true },
  })
  .get("/config", () => serveHtml("view/config.html"), {
    detail: { hide: true },
  })

  // --- Config ---------------------------------------------------------------
  .get(
    "/api/opcoes",
    () => {
      const livros = db
        .select({ id: opcao.id, titulo: opcao.titulo, md5: opcao.md5 })
        .from(opcao)
        .orderBy(opcao.posicao, opcao.id)
        .all();
      return { livros };
    },
    { detail: { summary: "Lista livros mapeados", tags: ["Configuração"] } },
  )

  .post(
    "/api/config",
    ({ body, set }) => {
      const { livros } = body as {
        livros?: Array<{ titulo: string; md5: string }>;
      };

      // PRAGMA foreign_keys is a no-op inside a transaction, so toggle it
      // around the whole thing (same connection as drizzle's).
      db.run(sql`PRAGMA foreign_keys = OFF`);
      try {
        db.transaction((tx) => {
          if (Array.isArray(livros)) {
            tx.run(sql`DELETE FROM opcao`);
            const seen = new Set<string>();
            livros.forEach((li, i) => {
              const md5 = String(li.md5 ?? "").trim().toLowerCase();
              const titulo = String(li.titulo ?? "").trim();
              if (!titulo || !/^[0-9a-f]{32}$/.test(md5) || seen.has(md5)) {
                return;
              }
              seen.add(md5);
              tx.insert(opcao)
                .values({ titulo, md5, posicao: i + 1 })
                .run();
            });
            // Remap existing records by md5, falling back to the label text
            // for legacy rows without md5.
            tx.run(sql`
              UPDATE leitura SET opcao_id = (
                SELECT id FROM opcao
                WHERE (opcao.md5 IS NOT NULL AND opcao.md5 = leitura.md5)
                   OR (leitura.md5 IS NULL AND opcao.md5 IS NULL
                       AND opcao.texto = leitura.tipo)
                LIMIT 1
              )
            `);
          }
        });
      } catch (err) {
        set.status = 500;
        return { ok: false, error: String(err) };
      } finally {
        db.run(sql`PRAGMA foreign_keys = ON`);
      }

      const livrosOut = db
        .select({ id: opcao.id, titulo: opcao.titulo, md5: opcao.md5 })
        .from(opcao)
        .orderBy(opcao.posicao, opcao.id)
        .all();
      return { ok: true, livros: livrosOut };
    },
    {
      body: t.Object({
        livros: t.Optional(
          t.Array(t.Object({ titulo: t.String(), md5: t.String() })),
        ),
      }),
      detail: {
        summary: "Salva a lista de livros mapeados",
        tags: ["Configuração"],
      },
    },
  )

  .get(
    "/api/config",
    () => {
      const livros = db
        .select({ id: opcao.id, titulo: opcao.titulo, md5: opcao.md5 })
        .from(opcao)
        .orderBy(opcao.posicao, opcao.id)
        .all();
      return { livros };
    },
    { detail: { summary: "Lê a configuração atual", tags: ["Configuração"] } },
  )

  // --- Leitura ----------------------------------------------------------------
  .get(
    "/api/leitura",
    ({ query }) => {
      const limit = Math.max(1, toNumber(query.limit ?? null, 100));
      const page = Math.max(1, toNumber(query.page ?? null, 1));

      const conditions = [];
      if (query.opcao_id)
        conditions.push(sql`l.opcao_id = ${toNumber(query.opcao_id, 0)}`);
      if (query.md5) conditions.push(sql`l.md5 = ${query.md5}`);
      if (query.sincronizada === "0" || query.sincronizada === "1" || query.sincronizada === "2")
        conditions.push(sql`l.leitura_sincronizada = ${query.sincronizada}`);
      if (query.data_inicio)
        conditions.push(sql`l.data_hora_1 >= ${query.data_inicio}`);
      if (query.data_fim)
        conditions.push(sql`l.data_hora_1 <= ${query.data_fim}`);
      const where = conditions.length
        ? sql`WHERE ${and(...conditions)}`
        : sql``;

      const total = (
        db.all(sql`SELECT COUNT(*) AS n FROM leitura l ${where}`)[0] as {
          n: number;
        }
      ).n;
      const pages = Math.max(1, Math.ceil(total / limit));
      const pageClamped = Math.min(page, pages);
      const offset = (pageClamped - 1) * limit;

      const rows = db.all(sql`
        SELECT l.id, l.tipo, l.opcao_id, l.op_id, l.origem,
               l.data_hora_1, l.data_hora_2,
               l.numero_1, l.numero_2, l.numero_3, l.created_at,
               l.md5, l.leitura_sincronizada,
               COALESCE(o.texto, l.tipo) AS titulo
        FROM leitura l LEFT JOIN opcao o ON o.id = l.opcao_id ${where}
        ORDER BY l.id DESC LIMIT ${limit} OFFSET ${offset}
      `);

      return { total, page: pageClamped, limit, pages, registros: rows };
    },
    {
      query: t.Object({
        opcao_id: t.Optional(t.String()),
        md5: t.Optional(t.String()),
        sincronizada: t.Optional(t.String()),
        data_inicio: t.Optional(t.String()),
        data_fim: t.Optional(t.String()),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      detail: {
        summary: "Lista registros com filtros e paginação",
        tags: ["Leitura"],
      },
    },
  )

  .get(
    "/api/export.csv",
    ({ query }) => {
      const conditions = [];
      if (query.opcao_id)
        conditions.push(sql`l.opcao_id = ${toNumber(query.opcao_id, 0)}`);
      if (query.md5) conditions.push(sql`l.md5 = ${query.md5}`);
      if (query.sincronizada === "0" || query.sincronizada === "1" || query.sincronizada === "2")
        conditions.push(sql`l.leitura_sincronizada = ${query.sincronizada}`);
      if (query.data_inicio)
        conditions.push(sql`l.data_hora_1 >= ${query.data_inicio}`);
      if (query.data_fim)
        conditions.push(sql`l.data_hora_1 <= ${query.data_fim}`);
      const where = conditions.length
        ? sql`WHERE ${and(...conditions)}`
        : sql``;

      const rows = db.all(sql`
        SELECT l.id, l.tipo, l.md5, l.data_hora_1, l.data_hora_2,
               l.numero_1, l.numero_2, l.numero_3, l.created_at,
               COALESCE(o.texto, l.tipo) AS titulo
        FROM leitura l LEFT JOIN opcao o ON o.id = l.opcao_id ${where}
        ORDER BY l.id ASC
      `) as Array<{
        id: number;
        tipo: string;
        md5: string;
        data_hora_1: string;
        data_hora_2: string;
        numero_1: number;
        numero_2: number;
        numero_3: number;
        created_at: string;
        titulo: string;
      }>;

      const csv = toCsv(
        [
          "id",
          "titulo",
          "md5",
          "data_hora_1",
          "data_hora_2",
          "numero_1",
          "numero_2",
          "numero_3",
          "created_at",
        ],
        rows.map((r) => [
          r.id,
          r.titulo,
          r.md5,
          r.data_hora_1,
          r.data_hora_2,
          r.numero_1,
          r.numero_2,
          r.numero_3,
          r.created_at,
        ]),
      );

      return new Response("\uFEFF" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="leitura.csv"',
        },
      });
    },
    {
      query: t.Object({
        opcao_id: t.Optional(t.String()),
        md5: t.Optional(t.String()),
        sincronizada: t.Optional(t.String()),
        data_inicio: t.Optional(t.String()),
        data_fim: t.Optional(t.String()),
      }),
      detail: {
        summary: "Exporta registros em CSV (BOM + RFC 4180)",
        tags: ["Leitura"],
      },
    },
  )

  .delete(
    "/api/leitura",
    ({ query, set }) => {
      const id = toNumber(query.id ?? null, 0);
      if (id <= 0) {
        set.status = 400;
        return { ok: false, error: "id inválido" };
      }
      const info = runRows(db.delete(leitura).where(eq(leitura.id, id)).run());
      return { ok: true, removidos: info.changes };
    },
    {
      query: t.Object({ id: t.Optional(t.String()) }),
      detail: { summary: "Exclui um registro", tags: ["Leitura"] },
    },
  )

  .patch(
    "/api/leitura",
    ({ query, body, set }) => {
      const id = toNumber(query.id ?? null, 0);
      if (id <= 0) {
        set.status = 400;
        return { ok: false, error: "id inválido" };
      }

      const result = validatePayloadPatch(body);
      if (!result.ok) {
        set.status = 400;
        return { ok: false, error: result.error };
      }
      const v = result.values as PatchValues;

      const patch: Partial<LeituraInsert> = {};
      if (v.tipo !== undefined) patch.tipo = v.tipo;
      if (v.opcao_id !== undefined) patch.opcaoId = v.opcao_id;
      if (v.op_id !== undefined) patch.opId = v.op_id;
      if (v.md5 !== undefined) patch.md5 = v.md5;
      if (v.data_hora_1 !== undefined) patch.dataHora1 = v.data_hora_1;
      if (v.data_hora_2 !== undefined) patch.dataHora2 = v.data_hora_2;
      if (v.numero_1 !== undefined) patch.numero1 = v.numero_1;
      if (v.numero_2 !== undefined) patch.numero2 = v.numero_2;
      if (v.numero_3 !== undefined) patch.numero3 = v.numero_3;
      if (v.leitura_sincronizada !== undefined)
        patch.leituraSincronizada =
          typeof v.leitura_sincronizada === "boolean"
            ? v.leitura_sincronizada
              ? 1
              : 0
            : v.leitura_sincronizada;

      db.update(leitura).set(patch).where(eq(leitura.id, id)).run();
      return { ok: true, id };
    },
    {
      query: t.Object({ id: t.Optional(t.String()) }),
      body: t.Partial(bodyLeitura),
      detail: {
        summary: "Edita um registro (campos parciais)",
        tags: ["Leitura"],
      },
    },
  )

  .post(
    "/api/leitura",
    ({ body, set }) => {
      // Idempotent replay: if the caller's op_id already exists, return the
      // existing row instead of inserting a duplicate (checked before any
      // lookup so a replay never creates a book entry).
      if (typeof body.op_id === "string" && body.op_id !== "") {
        const existing = db
          .select({ id: leitura.id })
          .from(leitura)
          .where(eq(leitura.opId, body.op_id))
          .get();
        if (existing) {
          return { ok: true, id: existing.id, duplicado: true };
        }
      }

      const result = validatePayload(body as Record<string, unknown>);
      if (!result.ok) {
        set.status = 400;
        return { ok: false, error: result.error };
      }
      const v = result.values as PayloadValues;

      const insert: LeituraInsert = {
        opId: v.op_id ?? null,
        tipo: v.tipo,
        opcaoId: v.opcao_id,
        md5: v.md5,
        origem: body.origem === "plugin" ? "plugin" : "web",
        dataHora1: v.data_hora_1,
        dataHora2: v.data_hora_2,
        numero1: v.numero_1,
        numero2: v.numero_2,
        numero3: v.numero_3,
      };

      try {
        const info = runRows(db.insert(leitura).values(insert).run());
        return { ok: true, id: info.lastInsertRowid };
      } catch (err) {
        if (err instanceof Error && err.message.includes("UNIQUE")) {
          set.status = 409;
          return { ok: false, error: "op_id já existente" };
        }
        throw err;
      }
    },
    {
      body: bodyLeitura,
      detail: {
        summary: "Registra uma leitura (idempotente via op_id)",
        tags: ["Leitura"],
      },
    },
  )

  .get(
    "/api/stats",
    () => {
      const global = db.all(sql`
      SELECT COUNT(*) AS total,
             COALESCE(MIN(data_hora_1), '') AS primeira_data,
             COALESCE(MAX(data_hora_2), '') AS ultima_data,
             COALESCE(AVG(numero_1), 0) AS media_num1,
             COALESCE(AVG(numero_2), 0) AS media_num2,
             COALESCE(AVG(numero_3), 0) AS media_num3,
             COALESCE(SUM(numero_1), 0) AS soma_num1,
             COALESCE(SUM(numero_2), 0) AS soma_num2,
             COALESCE(SUM(numero_3), 0) AS soma_num3,
             COALESCE(ROUND(AVG(julianday(data_hora_2) - julianday(data_hora_1)) * 24, 2), 0) AS duracao_media_horas
      FROM leitura
    `)[0] as Record<string, unknown>;

      const porTipo = db.all(sql`
      SELECT opcao_id, tipo, COUNT(*) AS n,
             COALESCE(ROUND(SUM(julianday(data_hora_2) - julianday(data_hora_1)) * 24, 2), 0) AS horas
      FROM leitura GROUP BY opcao_id, tipo ORDER BY n DESC
    `);

      const porDia = db.all(sql`
      SELECT substr(data_hora_1, 1, 10) AS dia,
             COUNT(*) AS n,
             COALESCE(ROUND(SUM(julianday(data_hora_2) - julianday(data_hora_1)) * 24, 2), 0) AS horas,
             COALESCE(SUM(numero_1), 0) AS soma_num1
      FROM leitura GROUP BY dia ORDER BY dia ASC
    `);

      const porMes = db.all(sql`
      SELECT substr(data_hora_1, 1, 7) AS mes,
             COUNT(*) AS n,
             COALESCE(ROUND(SUM(julianday(data_hora_2) - julianday(data_hora_1)) * 24, 2), 0) AS horas
      FROM leitura GROUP BY mes ORDER BY mes ASC
    `);

      return { ...global, por_tipo: porTipo, por_dia: porDia, por_mes: porMes };
    },
    { detail: { summary: "Estatísticas agregadas", tags: ["Leitura"] } },
  )
  .listen(PORT);

console.log(`Servidor rodando em http://localhost:${app.server?.port ?? PORT}`);
console.log(`OpenAPI UI: http://localhost:${app.server?.port ?? PORT}/openapi`);
