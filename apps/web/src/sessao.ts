export interface SessaoLeitura {
  livroId: number;
  md5: string;
  titulo: string;
  paginaInicial: number;
  inicio: string;
  criadoEm: number;
}

const KEY = "leitura-manual.sessao.ativa";

export const carregarSessao = (): SessaoLeitura | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SessaoLeitura>;
    if (
      typeof s.livroId === "number" &&
      typeof s.md5 === "string" &&
      typeof s.titulo === "string" &&
      typeof s.paginaInicial === "number" &&
      typeof s.inicio === "string" &&
      typeof s.criadoEm === "number"
    ) {
      return s as SessaoLeitura;
    }
    return null;
  } catch {
    return null;
  }
};

export const salvarSessao = (s: SessaoLeitura): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    return;
  }
};

export const descartarSessao = (): void => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    return;
  }
};