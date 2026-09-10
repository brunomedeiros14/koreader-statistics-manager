import {
  isValidIso,
  isValidMd5,
  isValidNumero,
  isValidSyncStatus,
  type PatchValues,
  type PayloadValues,
  type ValidationResult,
} from "@leitura/common";
import { eq } from "drizzle-orm";

import { db } from "./db";
import { opcao } from "./db/schema";

// drizzle/bun-sqlite types .run() as void but returns { changes, lastInsertRowid }.
type SqlRunResult = { changes: number; lastInsertRowid: number };

type LivroRef = { id: number; texto: string };

// Finds the book by md5; auto-registers it (with the given title) when unknown.
const resolveLivro = (md5: string, titulo?: string): LivroRef | { error: string } => {
  const found = db
    .select({ id: opcao.id, texto: opcao.titulo })
    .from(opcao)
    .where(eq(opcao.md5, md5))
    .get();
  if (found) return { id: found.id, texto: found.texto };

  if (!titulo || titulo.trim() === "") {
    return { error: "md5 não cadastrado e título ausente" };
  }
  const clean = titulo.trim();
  const info = db
    .insert(opcao)
    .values({ titulo: clean, md5 })
    .run() as unknown as SqlRunResult;
  return { id: info.lastInsertRowid, texto: clean };
};

// Validates a leitura payload: md5 is required and the referenced book is
// auto-registered on the server when it is unknown.
export function validatePayload(body: Record<string, unknown>): ValidationResult {
  const { op_id, md5, titulo, data_hora_1, data_hora_2, numero_1, numero_2, numero_3 } = body;

  if (op_id !== undefined && (typeof op_id !== "string" || op_id === "")) {
    return { ok: false, error: "op_id inválido" };
  }
  if (!isValidMd5(md5)) {
    return { ok: false, error: "md5 inválido (esperado 32 hex)" };
  }
  if (titulo !== undefined && (typeof titulo !== "string" || titulo.trim() === "")) {
    return { ok: false, error: "título inválido" };
  }
  if (!isValidIso(data_hora_1) || !isValidIso(data_hora_2)) {
    return { ok: false, error: "Data/hora inválida (esperado YYYY-MM-DDTHH:MM)" };
  }
  if (data_hora_2 <= data_hora_1) {
    return { ok: false, error: "Data/hora 2 deve ser posterior à Data/hora 1" };
  }
  if (!isValidNumero(numero_1) || !isValidNumero(numero_2) || !isValidNumero(numero_3)) {
    return { ok: false, error: "Inputs numéricos devem ser inteiros >= 0" };
  }
  if ((numero_2 as number) < (numero_1 as number)) {
    return { ok: false, error: "Página final deve ser maior ou igual à página inicial" };
  }
  if ((numero_3 as number) < 1) {
    return { ok: false, error: "Total de páginas do livro deve ser >= 1" };
  }

  const livro = resolveLivro(md5 as string, titulo as string | undefined);
  if ("error" in livro) {
    return { ok: false, error: livro.error };
  }

  return {
    ok: true,
    values: {
      op_id: op_id as string | undefined,
      md5: (md5 as string).toLowerCase(),
      titulo: livro.texto,
      opcao_id: livro.id,
      tipo: livro.texto,
      data_hora_1: data_hora_1 as string,
      data_hora_2: data_hora_2 as string,
      numero_1: numero_1 as number,
      numero_2: numero_2 as number,
      numero_3: numero_3 as number,
    },
  };
}

// Validates a partial leitura payload (PATCH): only the fields present are
// enforced against the same rules used by POST. When md5 is present the book
// reference (opcao_id + nome) is resolved from it.
export function validatePayloadPatch(body: Record<string, unknown>): ValidationResult {
  const { op_id, md5, titulo, data_hora_1, data_hora_2, numero_1, numero_2, numero_3, leitura_sincronizada } = body;

  if (op_id !== undefined && (typeof op_id !== "string" || op_id === "")) {
    return { ok: false, error: "op_id inválido" };
  }
  if (titulo !== undefined && (typeof titulo !== "string" || titulo.trim() === "")) {
    return { ok: false, error: "título inválido" };
  }
  if (md5 !== undefined && !isValidMd5(md5)) {
    return { ok: false, error: "md5 inválido (esperado 32 hex)" };
  }
  if (data_hora_1 !== undefined && !isValidIso(data_hora_1)) {
    return { ok: false, error: "Data/hora 1 inválida (esperado YYYY-MM-DDTHH:MM)" };
  }
  if (data_hora_2 !== undefined && !isValidIso(data_hora_2)) {
    return { ok: false, error: "Data/hora 2 inválida (esperado YYYY-MM-DDTHH:MM)" };
  }
  if (
    data_hora_1 !== undefined &&
    data_hora_2 !== undefined &&
    (data_hora_2 as string) <= (data_hora_1 as string)
  ) {
    return { ok: false, error: "Data/hora 2 deve ser posterior à Data/hora 1" };
  }
  for (const n of [numero_1, numero_2, numero_3]) {
    if (n !== undefined && !isValidNumero(n)) {
      return { ok: false, error: "Inputs numéricos devem ser inteiros >= 0" };
    }
  }
  if (
    numero_1 !== undefined &&
    numero_2 !== undefined &&
    (numero_2 as number) < (numero_1 as number)
  ) {
    return { ok: false, error: "Página final deve ser maior ou igual à página inicial" };
  }
  if (numero_3 !== undefined && (numero_3 as number) < 1) {
    return { ok: false, error: "Total de páginas do livro deve ser >= 1" };
  }
  if (leitura_sincronizada !== undefined && !isValidSyncStatus(leitura_sincronizada)) {
    return { ok: false, error: "leitura_sincronizada deve ser booleano ou 0/1/2" };
  }

  const values: PatchValues = {};
  if (op_id !== undefined) values.op_id = op_id as string;
  if (titulo !== undefined) values.titulo = (titulo as string).trim();
  if (md5 !== undefined) {
    const livro = resolveLivro((md5 as string).toLowerCase(), (titulo as string) || undefined);
    if ("error" in livro) {
      return { ok: false, error: livro.error };
    }
    values.md5 = (md5 as string).toLowerCase();
    values.opcao_id = livro.id;
    values.tipo = livro.texto;
  }
  if (data_hora_1 !== undefined) values.data_hora_1 = data_hora_1 as string;
  if (data_hora_2 !== undefined) values.data_hora_2 = data_hora_2 as string;
  if (numero_1 !== undefined) values.numero_1 = numero_1 as number;
  if (numero_2 !== undefined) values.numero_2 = numero_2 as number;
  if (numero_3 !== undefined) values.numero_3 = numero_3 as number;
  if (leitura_sincronizada !== undefined) values.leitura_sincronizada = leitura_sincronizada as boolean | number;

  return { ok: true, values };
}