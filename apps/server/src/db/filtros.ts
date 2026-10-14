import { and, sql, type SQL } from "drizzle-orm";

import { toNumber } from "@leitura/common";

export interface FiltrosLeitura {
  opcao_id?: string | null;
  md5?: string | null;
  sincronizada?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  modificado_depois?: string | null;
}

// WHERE compartilhado por GET /api/leitura e GET /api/export.csv. As colunas
// usam o alias `l`, então a consulta base deve ser `FROM leitura l`. O
// fragmento é neutro de dialeto: o drizzle o compila para `?` (SQLite) ou `$n`
// (Postgres) no momento da execução.
export const buildWhere = (query: FiltrosLeitura): SQL => {
  const conditions = [];
  if (query.opcao_id)
    conditions.push(sql`l.opcao_id = ${toNumber(query.opcao_id, 0)}`);
  if (query.md5) conditions.push(sql`l.md5 = ${query.md5}`);
  if (
    query.sincronizada === "0" ||
    query.sincronizada === "1" ||
    query.sincronizada === "2"
  )
    conditions.push(sql`l.leitura_sincronizada = ${query.sincronizada}`);
  if (query.data_inicio)
    conditions.push(sql`l.data_hora_1 >= ${query.data_inicio}`);
  if (query.data_fim) conditions.push(sql`l.data_hora_1 <= ${query.data_fim}`);
  // Registros com conteúdo alterado após um instante UTC (E.2 — re-sync de stats).
  if (query.modificado_depois)
    conditions.push(sql`l.updated_at > ${query.modificado_depois}`);
  return conditions.length ? sql`WHERE ${and(...conditions)}` : sql``;
};

const SORT_COLUMNS = {
  id: "l.id",
  titulo: "COALESCE(o.texto, l.tipo)",
  data_hora_1: "l.data_hora_1",
  data_hora_2: "l.data_hora_2",
  numero_1: "l.numero_1",
  numero_2: "l.numero_2",
  numero_3: "l.numero_3",
  created_at: "l.created_at",
} as const;

export type SortKey = keyof typeof SORT_COLUMNS | "duracao";

// Expressões de duração por dialeto (usadas na ordenação e nas estatísticas).
export const DURACAO_SQLITE = sql`(julianday(l.data_hora_2) - julianday(l.data_hora_1))`;
export const DURACAO_PG = sql`(EXTRACT(EPOCH FROM (l.data_hora_2::timestamptz - l.data_hora_1::timestamptz)))`;

// ORDER BY com whitelist (D.1/K.4). Sem `sort` cai no id DESC (comportamento
// anterior). Chaves fixas em um mapa, então nenhuma entrada do usuário chega
// ao SQL.
export const buildOrderBy = (
  sort: string | null | undefined,
  dir: string | null | undefined,
  duracao: SQL,
): SQL => {
  const d = dir === "asc" || dir === "desc" ? dir.toUpperCase() : "ASC";
  if (sort === "duracao") return sql`ORDER BY ${duracao} ${sql.raw(d)}`;
  const col = sort ? SORT_COLUMNS[sort as keyof typeof SORT_COLUMNS] : undefined;
  if (!col) return sql`ORDER BY l.id DESC`;
  return sql`ORDER BY ${sql.raw(col)} ${sql.raw(d)}`;
};
