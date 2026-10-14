import {
  type Livro,
  type LivroConfigItem,
  type LivroPersist,
} from "@leitura/common";

import { resolveCover } from "../covers";
import { repo } from "../db";

export type LivroRef = { id: number; texto: string };

export type UpsertLivroResult =
  | { ok: true; id: number; novo: boolean }
  | { ok: false; error: string; status?: number };

export type SalvarConfigResult =
  | { ok: true; livros: Livro[] }
  | { ok: false; error: string };

export const MD5_RE = /^[0-9a-f]{32}$/;

// Finds the book by md5; auto-registers it (with the given title) when unknown.
export const resolveLivro = async (
  md5: string,
  titulo?: string,
): Promise<LivroRef | { error: string }> => {
  const found = await repo.buscarLivroMd5(md5);
  if (found) return { id: found.id, texto: found.titulo };

  if (!titulo || titulo.trim() === "") {
    return { error: "md5 não cadastrado e título ausente" };
  }
  const clean = titulo.trim();
  const id = await repo.inserirLivro({ titulo: clean, md5 });
  return { id, texto: clean };
};

export const listarLivros = (): Promise<Livro[]> => repo.listarLivros();

// Registers/updates a book keyed by md5 (idempotent, never duplicates).
export const upsertLivro = async (body: {
  md5?: unknown;
  titulo?: unknown;
  autor?: unknown;
  imagem?: unknown;
}): Promise<UpsertLivroResult> => {
  const md5 = String(body.md5 ?? "").trim().toLowerCase();
  const titulo = String(body.titulo ?? "").trim();
  const autor = String(body.autor ?? "").trim();

  if (!MD5_RE.test(md5)) {
    return { ok: false, error: "md5 inválido (esperado 32 hex)", status: 400 };
  }
  if (!titulo) {
    return { ok: false, error: "título obrigatório", status: 400 };
  }

  const imagem = resolveCover(body.imagem ?? "", md5);

  const existing = await repo.buscarLivroMd5(md5);
  if (existing) {
    // Mantém a capa atual quando o sync não envia uma nova (ex.: plugin sem
    // imagem disponível), preservando capas definidas pela configuração web.
    const capa = imagem || existing.imagem || "";
    await repo.atualizarLivroMd5(md5, { titulo, autor, imagem: capa });
    return { ok: true, id: existing.id, novo: false };
  }

  const max = await repo.maxPosicaoLivro();
  const id = await repo.inserirLivro({
    titulo,
    autor,
    imagem,
    md5,
    posicao: Number(max) + 1,
  });
  return { ok: true, id, novo: true };
};

// Replaces the whole book list, keeping autor/imagem already known and
// remapping records by md5 (falling back to the legacy tipo text).
export const salvarConfig = async (
  livros?: LivroConfigItem[],
): Promise<SalvarConfigResult> => {
  try {
    if (Array.isArray(livros)) {
      const antigos = await repo.listarLivros();
      const seen = new Set<string>();
      const novos: LivroPersist[] = [];
      livros.forEach((li, i) => {
        const md5 = String(li.md5 ?? "").trim().toLowerCase();
        const titulo = String(li.titulo ?? "").trim();
        if (!titulo || !MD5_RE.test(md5) || seen.has(md5)) {
          return;
        }
        seen.add(md5);
        const prev = antigos.find((a) => a.md5 === md5);
        const autor = String(li.autor ?? "").trim() || prev?.autor || "";
        // remover_imagem limpa a capa de forma explícita; sem o flag, a
        // imagem anterior é mantida quando nenhuma nova é enviada.
        const remover = li.remover_imagem === true;
        const novaImagem = remover ? "" : resolveCover(li.imagem ?? "", md5);
        const imagem = remover ? "" : novaImagem || prev?.imagem || "";
        // Sem o campo explícito, mantém o valor anterior (default: visível).
        const oculto =
          typeof li.oculto === "boolean" ? li.oculto : prev?.oculto ?? false;
        novos.push({ titulo, autor, imagem, md5, posicao: i + 1, oculto });
      });
      await repo.substituirLivros(novos);
    } else {
      await repo.substituirLivros(undefined);
    }
  } catch (err) {
    return { ok: false, error: String(err) };
  }
  return { ok: true, livros: await repo.listarLivros() };
};
