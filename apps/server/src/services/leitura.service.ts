import {
  agoraUtc,
  toNumber,
  type LeituraInsert,
  type LeituraRegistro,
  type PatchValues,
  type PayloadValues,
  type PostLeituraPayload,
} from "@leitura/common";

import { repo } from "../db";
import type { FiltrosLeitura } from "../db/filtros";
import { validatePayload, validatePayloadPatch } from "../validation";

const csvCell = (value: unknown): string => {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};

const toCsv = (headers: string[], rows: Array<Array<unknown>>): string =>
  [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");

export type LeituraMutacao =
  | { ok: true; id?: number; duplicado?: boolean; removidos?: number }
  | { ok: false; error: string; status?: number };

// Fields that feed the stats sync; editing any of them invalidates a
// previous "sincronizada" state.
const CAMPOS_STATS = [
  "md5",
  "data_hora_1",
  "data_hora_2",
  "numero_1",
  "numero_2",
  "numero_3",
] as const;

// Detects a unique-constraint violation across drivers (SQLite mensagem/UNIQUE,
// Postgres por código SQLSTATE 23505).
const isUniqueViolation = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes("UNIQUE") ||
    (err as { code?: string }).code === "23505"
  );
};

export const listarLeitura = async (
  query: FiltrosLeitura & {
    page?: string | null;
    limit?: string | null;
    sort?: string | null;
    dir?: string | null;
  },
): Promise<{
  total: number;
  page: number;
  limit: number;
  pages: number;
  registros: LeituraRegistro[];
}> => {
  const limit = Math.max(1, toNumber(query.limit ?? null, 100));
  const page = Math.max(1, toNumber(query.page ?? null, 1));

  const total = await repo.contarLeitura(query);
  const pages = Math.max(1, Math.ceil(total / limit));
  const pageClamped = Math.min(page, pages);
  const offset = (pageClamped - 1) * limit;

  const registros = await repo.listarRegistros(query, limit, offset);

  return { total, page: pageClamped, limit, pages, registros };
};

export const exportarCsv = async (query: FiltrosLeitura): Promise<Response> => {
  const rows = await repo.exportarRegistros(query);

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
      "updated_at",
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
      r.updated_at,
    ]),
  );

  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leitura.csv"',
    },
  });
};

export const excluirLeitura = async (
  id: number,
): Promise<LeituraMutacao> => {
  if (id <= 0) {
    return { ok: false, error: "id inválido", status: 400 };
  }
  const changes = await repo.excluirLeitura(id);
  if (changes === 0) {
    return { ok: false, error: "registro não encontrado", status: 404 };
  }
  return { ok: true, removidos: changes };
};

export const criarLeitura = async (
  body: PostLeituraPayload,
  origem: "plugin" | "web",
): Promise<LeituraMutacao> => {
  // Idempotent replay: if the caller's op_id already exists, return the
  // existing row instead of inserting a duplicate (checked before any
  // lookup so a replay never creates a book entry).
  if (typeof body.op_id === "string" && body.op_id !== "") {
    const existing = await repo.buscarLeituraIdPorOpId(body.op_id);
    if (existing !== undefined) {
      return { ok: true, id: existing, duplicado: true };
    }
  }

  const result = await validatePayload(body as unknown as Record<string, unknown>);
  if (!result.ok) {
    return { ok: false, error: result.error, status: 400 };
  }
  const v = result.values as PayloadValues;

  const insert: LeituraInsert = {
    opId: v.op_id ?? null,
    tipo: v.tipo,
    opcaoId: v.opcao_id,
    md5: v.md5,
    origem,
    dataHora1: v.data_hora_1,
    dataHora2: v.data_hora_2,
    numero1: v.numero_1,
    numero2: v.numero_2,
    numero3: v.numero_3,
    updatedAt: agoraUtc(),
  };

  try {
    const id = await repo.inserirLeitura(insert);
    return { ok: true, id };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "op_id já existente", status: 409 };
    }
    throw err;
  }
};

export const editarLeitura = async (
  id: number,
  body: Record<string, unknown>,
): Promise<LeituraMutacao> => {
  if (id <= 0) {
    return { ok: false, error: "id inválido", status: 400 };
  }

  const existente = await repo.buscarLeituraPorId(id);
  if (!existente) {
    return { ok: false, error: "registro não encontrado", status: 404 };
  }

  const result = await validatePayloadPatch(body);
  if (!result.ok) {
    return { ok: false, error: result.error, status: 400 };
  }
  const v = result.values as PatchValues;

  // Cross-field validation against the combined (current + new) values, so a
  // single-field edit can't leave the row inconsistent (C.2).
  const numero1 = v.numero_1 ?? existente.numero1;
  const numero2 = v.numero_2 ?? existente.numero2;
  const dt1 = v.data_hora_1 ?? existente.dataHora1;
  const dt2 = v.data_hora_2 ?? existente.dataHora2;
  if (numero2 < numero1) {
    return { ok: false, error: "Página final deve ser maior ou igual à página inicial", status: 400 };
  }
  if (dt2 <= dt1) {
    return { ok: false, error: "Data/hora 2 deve ser posterior à Data/hora 1", status: 400 };
  }

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

  // Editing stats-affecting fields of a previously synced record marks it as
  // "em espera" again, since the synced data is no longer authoritative (F.1).
  // The update timestamp only moves when stats-affecting content changes (E.2):
  // non-stats edits (titulo, op_id, flag de sync) don't bump it.
  const afetaStats = CAMPOS_STATS.some((c) => v[c] !== undefined);
  if (afetaStats) {
    patch.updatedAt = agoraUtc();
    if (existente.leituraSincronizada === 1 && patch.leituraSincronizada === undefined) {
      patch.leituraSincronizada = 0;
    }
  }

  // PATCHes that only carry non-stored fields (e.g. titulo) are valid no-ops.
  if (Object.keys(patch).length === 0) {
    return { ok: true, id };
  }

  await repo.atualizarLeitura(id, patch);
  return { ok: true, id };
};
