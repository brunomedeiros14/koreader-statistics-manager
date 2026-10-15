import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type {
  LeituraExportRow,
  LeituraRegistro,
  LeituraRow,
  Livro,
  StatsResponse,
} from "@leitura/common";

import { DB_POSTGRES } from "./config";
import { buildOrderBy, buildWhere, DURACAO_PG } from "./filtros";
import type { FiltrosLeitura } from "./filtros";
import { runMigrationsPg } from "./migrations/pg";
import * as schema from "./schema/pg";
import type { LivroEncontrado, Repo } from "./types";

// Adaptador Postgres (node-postgres + drizzle). Diferente do SQLite, o cliente
// é assíncrono e o dialeto usa `$n`, SERIAL/BOOLEAN e funções de data próprias.
export const criarRepoPostgres = async (): Promise<Repo> => {
  const pool = new Pool({
    host: DB_POSTGRES.host,
    port: DB_POSTGRES.port,
    user: DB_POSTGRES.user,
    password: DB_POSTGRES.password,
    database: DB_POSTGRES.database,
  });

  await runMigrationsPg(pool);

  const db = drizzle(pool, { schema });

  const horasPg = sql`COALESCE(ROUND(CAST(SUM(EXTRACT(EPOCH FROM (data_hora_2::timestamptz - data_hora_1::timestamptz))) / 3600 AS numeric), 2), 0)`;

  const repo: Repo = {
    async ping() {
      await db.execute(sql`SELECT 1`);
    },

    async buscarLivroMd5(md5) {
      const rows = await db
        .select()
        .from(schema.opcao)
        .where(eq(schema.opcao.md5, md5));
      const row = rows[0];
      if (!row) return undefined;
      return {
        id: row.id,
        titulo: row.titulo,
        autor: row.autor,
        imagem: row.imagem,
        md5: row.md5,
        oculto: row.oculto,
      } satisfies LivroEncontrado;
    },

    async maxPosicaoLivro() {
      const rows = await db
        .select({ m: sql<number>`COALESCE(MAX(${schema.opcao.posicao}), 0)` })
        .from(schema.opcao);
      return Number(rows[0]?.m ?? 0);
    },

    async inserirLivro(v) {
      const rows = await db
        .insert(schema.opcao)
        .values({
          titulo: v.titulo,
          autor: v.autor ?? "",
          imagem: v.imagem ?? "",
          md5: v.md5,
          posicao: v.posicao ?? 0,
          oculto: v.oculto ?? false,
        })
        .returning({ id: schema.opcao.id });
      return rows[0]!.id;
    },

    async atualizarLivroMd5(md5, v) {
      await db
        .update(schema.opcao)
        .set({ titulo: v.titulo, autor: v.autor, imagem: v.imagem })
        .where(eq(schema.opcao.md5, md5));
    },

    async listarLivros() {
      return db
        .select({
          id: schema.opcao.id,
          titulo: schema.opcao.titulo,
          autor: schema.opcao.autor,
          imagem: schema.opcao.imagem,
          md5: schema.opcao.md5,
          oculto: schema.opcao.oculto,
        })
        .from(schema.opcao)
        .orderBy(schema.opcao.posicao, schema.opcao.id) satisfies Promise<Livro[]>;
    },

    async substituirLivros(livros) {
      await db.transaction(async (tx) => {
        if (!Array.isArray(livros)) return;
        // Solta a FK antes de limpar a tabela; o remapeamento por md5 é
        // refeito logo após as reinserções.
        await tx.execute(sql`UPDATE leitura SET opcao_id = NULL`);
        await tx.execute(sql`DELETE FROM opcao`);
        for (const l of livros) {
          await tx.insert(schema.opcao).values({
            titulo: l.titulo,
            autor: l.autor,
            imagem: l.imagem,
            md5: l.md5,
            posicao: l.posicao,
            oculto: l.oculto,
          });
        }
        await tx.execute(sql`
          UPDATE leitura SET opcao_id = (
            SELECT id FROM opcao
            WHERE (opcao.md5 IS NOT NULL AND opcao.md5 = leitura.md5)
               OR (leitura.md5 IS NULL AND opcao.md5 IS NULL
                   AND opcao.texto = leitura.tipo)
            LIMIT 1
          )
        `);
      });
    },

    async contarLeitura(q) {
      const res = await db.execute(
        sql`SELECT COUNT(*) AS n FROM leitura l ${buildWhere(q)}`,
      );
      const row = res.rows[0] as { n: string | number } | undefined;
      return Number(row?.n ?? 0);
    },

    async listarRegistros(q, limit, offset) {
      const res = await db.execute(sql`
        SELECT l.id, l.tipo, l.opcao_id, l.op_id, l.origem,
               l.data_hora_1, l.data_hora_2,
               l.numero_1, l.numero_2, l.numero_3, l.created_at,
               l.md5, l.leitura_sincronizada, l.updated_at,
               COALESCE(o.texto, l.tipo) AS titulo
        FROM leitura l LEFT JOIN opcao o ON o.id = l.opcao_id ${buildWhere(q)}
        ${buildOrderBy(q.sort, q.dir, DURACAO_PG)}
        LIMIT ${limit} OFFSET ${offset}
      `);
      return res.rows as unknown as LeituraRegistro[];
    },

    async exportarRegistros(q) {
      const res = await db.execute(sql`
        SELECT l.id, l.tipo, l.md5, l.data_hora_1, l.data_hora_2,
               l.numero_1, l.numero_2, l.numero_3, l.created_at, l.updated_at,
               COALESCE(o.texto, l.tipo) AS titulo
        FROM leitura l LEFT JOIN opcao o ON o.id = l.opcao_id ${buildWhere(q)}
        ORDER BY l.id ASC
      `);
      return res.rows as unknown as LeituraExportRow[];
    },

    async excluirLeitura(id) {
      const rows = await db
        .delete(schema.leitura)
        .where(eq(schema.leitura.id, id))
        .returning({ id: schema.leitura.id });
      return rows.length;
    },

    async buscarLeituraIdPorOpId(opId) {
      const rows = await db
        .select({ id: schema.leitura.id })
        .from(schema.leitura)
        .where(eq(schema.leitura.opId, opId));
      return rows[0]?.id;
    },

    async buscarLeituraPorId(id) {
      const rows = await db
        .select()
        .from(schema.leitura)
        .where(eq(schema.leitura.id, id));
      return rows[0] satisfies LeituraRow | undefined;
    },

    async inserirLeitura(v) {
      const rows = await db
        .insert(schema.leitura)
        .values(v)
        .returning({ id: schema.leitura.id });
      return rows[0]!.id;
    },

    async atualizarLeitura(id, patch) {
      await db
        .update(schema.leitura)
        .set(patch)
        .where(eq(schema.leitura.id, id));
    },

    async stats(filtros: FiltrosLeitura = {}) {
      const where = buildWhere(filtros);

      const g = (
        await db.execute(sql`
          SELECT COUNT(*) AS total,
                 COALESCE(MIN(data_hora_1), '') AS primeira_data,
                 COALESCE(MAX(data_hora_2), '') AS ultima_data,
                 COALESCE(AVG(numero_1), 0) AS media_num1,
                 COALESCE(AVG(numero_2), 0) AS media_num2,
                 COALESCE(AVG(numero_3), 0) AS media_num3,
                 COALESCE(SUM(numero_1), 0) AS soma_num1,
                 COALESCE(SUM(numero_2), 0) AS soma_num2,
                 COALESCE(SUM(numero_3), 0) AS soma_num3,
                 COALESCE(ROUND(CAST(AVG(EXTRACT(EPOCH FROM (data_hora_2::timestamptz - data_hora_1::timestamptz))) / 3600 AS numeric), 2), 0) AS duracao_media_horas,
                 ${horasPg} AS duracao_total_horas,
                 COALESCE(SUM(CASE WHEN numero_2 >= numero_1 THEN numero_2 - numero_1 + 1 ELSE 0 END), 0) AS paginas_lidas
          FROM leitura l ${where}
        `)
      ).rows[0] as Record<string, string | number | null>;

      const tipo = (
        await db.execute(sql`
          SELECT opcao_id, tipo, COUNT(*) AS n, ${horasPg} AS horas
          FROM leitura l ${where} GROUP BY opcao_id, tipo ORDER BY n DESC
        `)
      ).rows as Array<Record<string, string | number | null>>;

      const dia = (
        await db.execute(sql`
          SELECT substr(data_hora_1, 1, 10) AS dia,
                 COUNT(*) AS n,
                 ${horasPg} AS horas,
                 COALESCE(SUM(numero_1), 0) AS soma_num1
          FROM leitura l ${where} GROUP BY dia ORDER BY dia ASC
        `)
      ).rows as Array<Record<string, string | number | null>>;

      const mes = (
        await db.execute(sql`
          SELECT substr(data_hora_1, 1, 7) AS mes,
                 COUNT(*) AS n,
                 ${horasPg} AS horas
          FROM leitura l ${where} GROUP BY mes ORDER BY mes ASC
        `)
      ).rows as Array<Record<string, string | number | null>>;

      const num = (v: unknown): number => Number(v ?? 0);

      return {
        total: num(g?.total),
        primeira_data: String(g?.primeira_data ?? ""),
        ultima_data: String(g?.ultima_data ?? ""),
        media_num1: num(g?.media_num1),
        media_num2: num(g?.media_num2),
        media_num3: num(g?.media_num3),
        soma_num1: num(g?.soma_num1),
        soma_num2: num(g?.soma_num2),
        soma_num3: num(g?.soma_num3),
        duracao_media_horas: num(g?.duracao_media_horas),
        duracao_total_horas: num(g?.duracao_total_horas),
        paginas_lidas: num(g?.paginas_lidas),
        por_tipo: tipo.map((r) => ({
          opcao_id: r.opcao_id === null ? null : num(r.opcao_id),
          tipo: (r.tipo as string | null) ?? null,
          n: num(r.n),
          horas: num(r.horas),
        })),
        por_dia: dia.map((r) => ({
          dia: String(r.dia),
          n: num(r.n),
          horas: num(r.horas),
          soma_num1: num(r.soma_num1),
        })),
        por_mes: mes.map((r) => ({
          mes: String(r.mes),
          n: num(r.n),
          horas: num(r.horas),
        })),
      } satisfies StatsResponse;
    },
  };

  return repo;
};
