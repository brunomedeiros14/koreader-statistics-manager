import { Database } from "bun:sqlite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

import type {
  LeituraExportRow,
  LeituraRegistro,
  LeituraRow,
  Livro,
  StatsResponse,
} from "@leitura/common";

import { DB_SQLITE_PATH } from "./config";
import { buildOrderBy, buildWhere, DURACAO_SQLITE } from "./filtros";
import { runMigrations } from "./migrations/sqlite";
import * as schema from "./schema/sqlite";
import type { LivroEncontrado, Repo } from "./types";

// drizzle/bun-sqlite tipa .run() como void, mas ele retorna
// { changes, lastInsertRowid } em tempo de execução.
type SqlRunResult = { changes: number; lastInsertRowid: number };
const runRows = (result: unknown): SqlRunResult => result as SqlRunResult;

// Adaptador SQLite (bun:sqlite + drizzle). O cliente do bun:sqlite é síncrono,
// mas a interface Repo é assíncrona para ser idêntica à do Postgres.
export const criarRepoSqlite = (): Repo => {
  mkdirSync(dirname(DB_SQLITE_PATH), { recursive: true });
  const sqlite = new Database(DB_SQLITE_PATH);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  runMigrations(sqlite);

  const db = drizzle(sqlite, { schema });

  const repo: Repo = {
    async ping() {
      db.run(sql`SELECT 1`);
    },

    async buscarLivroMd5(md5) {
      const row = db
        .select()
        .from(schema.opcao)
        .where(eq(schema.opcao.md5, md5))
        .get();
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
      const row = db
        .select({ m: sql<number>`COALESCE(MAX(${schema.opcao.posicao}), 0)` })
        .from(schema.opcao)
        .get();
      return Number(row?.m ?? 0);
    },

    async inserirLivro(v) {
      const info = runRows(
        db
          .insert(schema.opcao)
          .values({
            titulo: v.titulo,
            autor: v.autor ?? "",
            imagem: v.imagem ?? "",
            md5: v.md5,
            posicao: v.posicao ?? 0,
            oculto: v.oculto ?? false,
          })
          .run(),
      );
      return Number(info.lastInsertRowid);
    },

    async atualizarLivroMd5(md5, v) {
      db.update(schema.opcao)
        .set({ titulo: v.titulo, autor: v.autor, imagem: v.imagem })
        .where(eq(schema.opcao.md5, md5))
        .run();
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
        .orderBy(schema.opcao.posicao, schema.opcao.id)
        .all() satisfies Livro[];
    },

    async substituirLivros(livros) {
      // PRAGMA foreign_keys é no-op dentro de transação, então alterna em
      // volta de tudo (mesma conexão do drizzle).
      db.run(sql`PRAGMA foreign_keys = OFF`);
      try {
        db.transaction((tx) => {
          if (Array.isArray(livros)) {
            tx.run(sql`DELETE FROM opcao`);
            for (const l of livros) {
              tx.insert(schema.opcao)
                .values({
                  titulo: l.titulo,
                  autor: l.autor,
                  imagem: l.imagem,
                  md5: l.md5,
                  posicao: l.posicao,
                  oculto: l.oculto,
                })
                .run();
            }
            // Remapeia registros por md5 (fallback no texto legado). Linhas sem
            // correspondência viram NULL (subquery escalar sem resultado).
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
      } finally {
        db.run(sql`PRAGMA foreign_keys = ON`);
      }
    },

    async contarLeitura(q) {
      const row = db.all(
        sql`SELECT COUNT(*) AS n FROM leitura l ${buildWhere(q)}`,
      )[0] as { n: number } | undefined;
      return Number(row?.n ?? 0);
    },

    async listarRegistros(q, limit, offset) {
      return db.all(sql`
        SELECT l.id, l.tipo, l.opcao_id, l.op_id, l.origem,
               l.data_hora_1, l.data_hora_2,
               l.numero_1, l.numero_2, l.numero_3, l.created_at,
               l.md5, l.leitura_sincronizada, l.updated_at,
               COALESCE(o.texto, l.tipo) AS titulo
        FROM leitura l LEFT JOIN opcao o ON o.id = l.opcao_id ${buildWhere(q)}
        ${buildOrderBy(q.sort, q.dir, DURACAO_SQLITE)}
        LIMIT ${limit} OFFSET ${offset}
      `) as LeituraRegistro[];
    },

    async exportarRegistros(q) {
      return db.all(sql`
        SELECT l.id, l.tipo, l.md5, l.data_hora_1, l.data_hora_2,
               l.numero_1, l.numero_2, l.numero_3, l.created_at, l.updated_at,
               COALESCE(o.texto, l.tipo) AS titulo
        FROM leitura l LEFT JOIN opcao o ON o.id = l.opcao_id ${buildWhere(q)}
        ORDER BY l.id ASC
      `) as LeituraExportRow[];
    },

    async excluirLeitura(id) {
      const info = runRows(
        db.delete(schema.leitura).where(eq(schema.leitura.id, id)).run(),
      );
      return Number(info.changes);
    },

    async buscarLeituraIdPorOpId(opId) {
      const row = db
        .select({ id: schema.leitura.id })
        .from(schema.leitura)
        .where(eq(schema.leitura.opId, opId))
        .get();
      return row?.id;
    },

    async buscarLeituraPorId(id) {
      return db
        .select()
        .from(schema.leitura)
        .where(eq(schema.leitura.id, id))
        .get() satisfies LeituraRow | undefined;
    },

    async inserirLeitura(v) {
      const info = runRows(db.insert(schema.leitura).values(v).run());
      return Number(info.lastInsertRowid);
    },

    async atualizarLeitura(id, patch) {
      db.update(schema.leitura)
        .set(patch)
        .where(eq(schema.leitura.id, id))
        .run();
    },

    async stats() {
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
               COALESCE(ROUND(AVG(julianday(data_hora_2) - julianday(data_hora_1)) * 24, 2), 0) AS duracao_media_horas,
               COALESCE(ROUND(SUM(julianday(data_hora_2) - julianday(data_hora_1)) * 24, 2), 0) AS duracao_total_horas,
               COALESCE(SUM(CASE WHEN numero_2 >= numero_1 THEN numero_2 - numero_1 + 1 ELSE 0 END), 0) AS paginas_lidas
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

      return {
        ...global,
        por_tipo: porTipo,
        por_dia: porDia,
        por_mes: porMes,
      } as unknown as StatsResponse;
    },
  };

  return repo;
};
