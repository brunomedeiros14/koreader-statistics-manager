import {
  isValidDataHora,
  isValidMd5,
  isValidNumero,
  isValidSyncStatus,
  normalizarUtc,
  type PatchValues,
  type PayloadValues,
  type ValidationResult,
} from "@leitura/common";

import { resolveLivro } from "./services/livros.service";

// Validates a leitura payload: md5 is required and the referenced book is
// auto-registered on the server when it is unknown. Datetimes are normalized
// to the canonical UTC form ("YYYY-MM-DDTHH:MM:SSZ").
export async function validatePayload(
  body: Record<string, unknown>,
): Promise<ValidationResult> {
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
  if (!isValidDataHora(data_hora_1)) {
    return { ok: false, error: "Data/hora inválida (esperado YYYY-MM-DDTHH:MM ou UTC com Z)" };
  }
  if (!isValidDataHora(data_hora_2)) {
    return { ok: false, error: "Data/hora inválida (esperado YYYY-MM-DDTHH:MM ou UTC com Z)" };
  }

  const dt1 = normalizarUtc(data_hora_1);
  const dt2 = normalizarUtc(data_hora_2);
  if (dt1 === null || dt2 === null) {
    return { ok: false, error: "Data/hora inválida (esperado YYYY-MM-DDTHH:MM ou UTC com Z)" };
  }
  if (dt2 <= dt1) {
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

  const livro = await resolveLivro(md5 as string, titulo as string | undefined);
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
      data_hora_1: dt1,
      data_hora_2: dt2,
      numero_1: numero_1 as number,
      numero_2: numero_2 as number,
      numero_3: numero_3 as number,
    },
  };
}

// Validates a partial leitura payload (PATCH): only the fields present are
// enforced against the same rules used by POST. When md5 is present the book
// reference (opcao_id + nome) is resolved from it.
export async function validatePayloadPatch(
  body: Record<string, unknown>,
): Promise<ValidationResult> {
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
  if (data_hora_1 !== undefined && !isValidDataHora(data_hora_1)) {
    return { ok: false, error: "Data/hora 1 inválida (esperado YYYY-MM-DDTHH:MM ou UTC com Z)" };
  }
  if (data_hora_2 !== undefined && !isValidDataHora(data_hora_2)) {
    return { ok: false, error: "Data/hora 2 inválida (esperado YYYY-MM-DDTHH:MM ou UTC com Z)" };
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
    const livro = await resolveLivro((md5 as string).toLowerCase(), (titulo as string) || undefined);
    if ("error" in livro) {
      return { ok: false, error: livro.error };
    }
    values.md5 = (md5 as string).toLowerCase();
    values.opcao_id = livro.id;
    values.tipo = livro.texto;
  }
  if (data_hora_1 !== undefined) {
    const dt = normalizarUtc(data_hora_1);
    if (dt === null) {
      return { ok: false, error: "Data/hora 1 inválida (esperado YYYY-MM-DDTHH:MM ou UTC com Z)" };
    }
    values.data_hora_1 = dt;
  }
  if (data_hora_2 !== undefined) {
    const dt = normalizarUtc(data_hora_2);
    if (dt === null) {
      return { ok: false, error: "Data/hora 2 inválida (esperado YYYY-MM-DDTHH:MM ou UTC com Z)" };
    }
    values.data_hora_2 = dt;
  }
  if (numero_1 !== undefined) values.numero_1 = numero_1 as number;
  if (numero_2 !== undefined) values.numero_2 = numero_2 as number;
  if (numero_3 !== undefined) values.numero_3 = numero_3 as number;
  if (leitura_sincronizada !== undefined) values.leitura_sincronizada = leitura_sincronizada as boolean | number;

  return { ok: true, values };
}