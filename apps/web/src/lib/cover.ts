// Normalizes an opcao.imagem value into something the <img> tag can use:
// a covers/ path, a data: URI, or raw base64 (treated as PNG).
export const coverSrc = (imagem: string | null | undefined): string | null => {
  if (!imagem) return null;
  if (imagem.startsWith("data:")) return imagem;
  if (imagem.startsWith("covers/") || imagem.startsWith("/covers/")) {
    return `/${imagem.replace(/^\/+/, "")}`;
  }
  return `data:image/png;base64,${imagem}`;
};