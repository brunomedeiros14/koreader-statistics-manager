import { createHash, timingSafeEqual } from "crypto";

// Autenticação opcional em LAN (B.2): quando LEITURA_TOKEN está definido no
// ambiente, toda rota /api/* exige o token no cabeçalho Authorization: Bearer.
// Comparação em tempo constante do digest (não vaza tamanho do token).
const TOKEN = process.env.LEITURA_TOKEN ?? "";

export const authAtiva = TOKEN !== "";

const digest = (s: string): Buffer =>
  createHash("sha256").update(s).digest();

export const autorizado = (header: string | null | undefined): boolean => {
  if (!authAtiva) return true;
  const given = (header ?? "").match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!given) return false;
  try {
    return timingSafeEqual(digest(given), digest(TOKEN));
  } catch {
    return false;
  }
};

// Token que o SPA injeta para autenticar as chamadas /api (só quando ativo).
export const tokenParaWeb = (): string | null => (authAtiva ? TOKEN : null);