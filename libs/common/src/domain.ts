export const toNumber = (value: string | null, fallback: number): number => {
  if (value === null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const isValidIso = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);

export const isValidNumero = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

export const isValidMd5 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-fA-F]{32}$/.test(value);

export const isValidSyncStatus = (value: unknown): value is boolean | number =>
  typeof value === "boolean" ||
  (typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 2);

// --- Livros (opcao) ----------------------------------------------------------

export interface Livro {
  id: number;
  titulo: string;
  md5: string | null;
}

export interface LivroInput {
  titulo: string;
  md5: string;
}

export interface OpcoesResponse {
  livros: Livro[];
}

export type SalvarConfigResponse =
  | { ok: true; livros: Livro[] }
  | { ok: false; error?: string };

// --- Leitura (registros) ------------------------------------------------------

export interface LeituraRegistro {
  id: number;
  tipo: string | null;
  opcao_id: number | null;
  op_id: string | null;
  origem: string | null;
  data_hora_1: string;
  data_hora_2: string;
  numero_1: number;
  numero_2: number;
  numero_3: number;
  created_at: string;
  md5: string | null;
  leitura_sincronizada: number | null;
  titulo: string;
}

export interface ListaLeituraResponse {
  total: number;
  page: number;
  limit: number;
  pages: number;
  registros: LeituraRegistro[];
}

export interface PostLeituraPayload {
  op_id?: string;
  md5: string;
  titulo?: string;
  origem?: string;
  data_hora_1: string;
  data_hora_2: string;
  numero_1: number;
  numero_2: number;
  numero_3: number;
}

export interface PatchLeituraPayload {
  md5?: string;
  titulo?: string;
  data_hora_1?: string;
  data_hora_2?: string;
  numero_1?: number;
  numero_2?: number;
  numero_3?: number;
  leitura_sincronizada?: boolean | number;
}

export type MutacaoResponse =
  | { ok: true; id?: number; duplicado?: boolean }
  | { ok: false; error: string };

export interface StatsResponse {
  total: number;
  primeira_data: string;
  ultima_data: string;
  media_num1: number;
  media_num2: number;
  media_num3: number;
  soma_num1: number;
  soma_num2: number;
  soma_num3: number;
  duracao_media_horas: number;
  duracao_total_horas: number;
  paginas_lidas: number;
  por_tipo: Array<{
    opcao_id: number | null;
    tipo: string | null;
    n: number;
    horas: number;
  }>;
  por_dia: Array<{ dia: string; n: number; horas: number; soma_num1: number }>;
  por_mes: Array<{ mes: string; n: number; horas: number }>;
}

// --- Validação ---------------------------------------------------------------

export interface PayloadValues {
  op_id: string | undefined;
  md5: string;
  titulo: string;
  opcao_id: number;
  tipo: string;
  data_hora_1: string;
  data_hora_2: string;
  numero_1: number;
  numero_2: number;
  numero_3: number;
}

export interface PatchValues {
  op_id?: string;
  md5?: string;
  titulo?: string;
  opcao_id?: number;
  tipo?: string;
  data_hora_1?: string;
  data_hora_2?: string;
  numero_1?: number;
  numero_2?: number;
  numero_3?: number;
  leitura_sincronizada?: boolean | number;
}

export type ValidationResult =
  | { ok: true; values: PayloadValues | PatchValues }
  | { ok: false; error: string };