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

const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, init);
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

export const apiStats = (): Promise<StatsResponse> => json("/api/stats");