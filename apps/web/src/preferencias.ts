export type ModoEstante = "tabela" | "imagem";

const KEY = "leitura-manual.preferencias.estante";

export const carregarModoEstante = (): ModoEstante => {
  try {
    const raw = localStorage.getItem(KEY) as ModoEstante | null;
    return raw === "imagem" || raw === "tabela" ? raw : "imagem";
  } catch {
    return "imagem";
  }
};

export const salvarModoEstante = (modo: ModoEstante): void => {
  try {
    localStorage.setItem(KEY, modo);
  } catch {
    return;
  }
};