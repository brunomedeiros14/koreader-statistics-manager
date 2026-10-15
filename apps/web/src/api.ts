import type {
  ListaLeituraResponse,
  LivroInput,
  MutacaoResponse,
  OpcoesResponse,
  PatchLeituraPayload,
  PostLeituraPayload,
  SalvarConfigResponse,
  StatsResponse,
} from "@leitura/common";

// B.2: token opcional injetado pelo servidor via <meta name="leitura-token">.
const tokenMeta = (): string | null =>
  document.querySelector('meta[name="leitura-token"]')?.getAttribute("content") ??
  null;

const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
  // Todo pedido (GET incluso) leva o token quando a auth está ativa.
  const headers = new Headers(init?.headers);
  const token = tokenMeta();
  if (token) headers.set("Authorization", "Bearer " + token);
  const res = await fetch(url, { ...init, headers });
  return res.json() as Promise<T>;
};

export const apiGetOpcoes = (): Promise<OpcoesResponse> =>
  json("/api/opcoes");

export const apiSalvarConfig = (
  livros: LivroInput[],
): Promise<SalvarConfigResponse> =>
  json("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ livros }),
  });

export const apiListaLeitura = (
  params: URLSearchParams,
): Promise<ListaLeituraResponse> => json(`/api/leitura?${params.toString()}`);

export const apiBuscarUltimaLeitura = (
  md5: string,
): Promise<ListaLeituraResponse> =>
  json(
    `/api/leitura?${new URLSearchParams({ md5, limit: "1" }).toString()}`,
  );

export const apiPostLeitura = (
  payload: PostLeituraPayload,
): Promise<MutacaoResponse> =>
  json("/api/leitura", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const apiPatchLeitura = (
  id: number,
  payload: PatchLeituraPayload,
): Promise<MutacaoResponse> =>
  json(`/api/leitura?id=${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const apiDeleteLeitura = (id: number): Promise<MutacaoResponse> =>
  json(`/api/leitura?id=${id}`, { method: "DELETE" });

export const apiStats = (params?: URLSearchParams): Promise<StatsResponse> => {
  const qs = params?.toString();
  return json(`/api/stats${qs ? `?${qs}` : ""}`);
};