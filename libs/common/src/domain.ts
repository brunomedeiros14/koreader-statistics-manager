// Datetime helpers ----------------------------------------------------------
//
// The API stores datetimes in a canonical UTC form: "YYYY-MM-DDTHH:MM:SSZ"
// (ISO-8601, seconds + Z). Clients convert their local wall-clock to UTC
// before sending. A legacy naive form "YYYY-MM-DDTHH:MM" is still accepted
// on input and normalized as if it were UTC (A.1/C.3).

const NAIVE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const UTC_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

const validarComponentes = (m: RegExpExecArray): boolean => {
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] ?? 0);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59)
    return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
};

// Legacy input format accepted from old/foreign clients.
export const isValidIso = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const m = NAIVE_RE.exec(value);
  if (!m) return false;
  return validarComponentes(m);
};

// Canonical UTC form stored/emitted by the current API.
export const isValidIsoUtc = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const m = UTC_RE.exec(value);
  if (!m) return false;
  return validarComponentes(m);
};

// A datetime field may arrive either as the canonical UTC form or the legacy
// naive form. Both are accepted on input, then normalized (see normalizarUtc).
export const isValidDataHora = (value: unknown): value is string =>
  isValidIso(value) || isValidIsoUtc(value);

// Normalizes a datetime to the canonical UTC form. Naive values are treated
// as UTC (the client is responsible for the local->UTC conversion); canonical
// values are returned unchanged. Returns null for anything invalid.
// Defensive string tracking: the type guards are `value is string`, and using
// them consecutively would let TS narrow a string to `never` on a false branch.
export const normalizarUtc = (value: unknown): string | null => {
  const s = typeof value === "string" ? value : null;
  if (s === null) return null;
  const utc = UTC_RE.exec(s);
  if (utc) return validarComponentes(utc) ? s : null;
  const naive = NAIVE_RE.exec(s);
  if (naive) {
    return validarComponentes(naive)
      ? s.replace(NAIVE_RE, "$1-$2-$3T$4:$5:00Z")
      : null;
  }
  return null;
};

// Current UTC instant in the canonical form.
export const agoraUtc = (): string =>
  new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

export const toNumber = (value: string | null, fallback: number): number => {
  if (value === null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

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
  autor: string | null;
  imagem: string | null;
  md5: string | null;
  oculto: boolean;
}

export interface LivroInput {
  titulo: string;
  md5: string;
  autor?: string;
  imagem?: string;
  remover_imagem?: boolean;
  oculto?: boolean;
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
  updated_at: string | null;
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

export interface SyncLivroPayload {
  md5: string;
  titulo: string;
  autor?: string;
  imagem?: string;
}

export type SyncLivroResponse =
  | { ok: true; id: number; novo: boolean }
  | { ok: false; error: string };

// --- Validação ---------------------------------------------------------------

// data_hora_1/data_hora_2 in these payloads are always canonical UTC
// ("YYYY-MM-DDTHH:MM:SSZ") after normalizarUtc on the server.

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

// --- Persistência (tipos neutros de dialeto) ---------------------------------
//
// Estes tipos descrevem as linhas como o domínio as enxerga, independentes do
// banco (SQLite ou Postgres). Cada adaptador de driver é responsável por
// mapear colunas/formatos para esta forma canônica (camelCase, booleanos,
// inteiros), para que services e rotas não conheçam dialeto algum.

export interface LeituraRow {
  id: number;
  tipo: string | null;
  opcaoId: number | null;
  opId: string | null;
  origem: string;
  dataHora1: string;
  dataHora2: string;
  numero1: number;
  numero2: number;
  numero3: number;
  md5: string | null;
  leituraSincronizada: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface LeituraInsert {
  opId?: string | null;
  tipo?: string | null;
  opcaoId?: number | null;
  md5?: string | null;
  origem: string;
  dataHora1: string;
  dataHora2: string;
  numero1: number;
  numero2: number;
  numero3: number;
  leituraSincronizada?: number;
  createdAt?: string;
  updatedAt?: string | null;
}

// Livro já normalizado para persistência (posição/oculto resolvidos).
export interface LivroPersist {
  titulo: string;
  autor: string;
  imagem: string;
  md5: string;
  posicao: number;
  oculto: boolean;
}

export interface LeituraExportRow {
  id: number;
  tipo: string | null;
  md5: string | null;
  data_hora_1: string;
  data_hora_2: string;
  numero_1: number;
  numero_2: number;
  numero_3: number;
  created_at: string;
  updated_at: string | null;
  titulo: string;
}