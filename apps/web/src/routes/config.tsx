import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { apiGetOpcoes, apiSalvarConfig } from "../api";
import { BannerErro } from "../components/BannerErro";
import { Modal } from "../components/Modal";
import { useApi } from "../hooks/useApi";
import { coverSrc } from "../lib/cover";
import {
  carregarModoEstante,
  salvarModoEstante,
  type ModoEstante,
} from "../preferencias";

export const Route = createFileRoute("/config")({ component: ConfigPage });

interface ItemLivro {
  id: number | null;
  titulo: string;
  autor: string;
  imagem: string;
  md5: string;
  removerImagem: boolean;
  oculto: boolean;
}

interface Mensagem {
  ok: boolean;
  texto: string;
}

function ConfigPage() {
  const [livros, setLivros] = useState<ItemLivro[]>([]);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [modoEstante, setModoEstante] = useState<ModoEstante>(() =>
    carregarModoEstante(),
  );
  const opcoes = useApi(apiGetOpcoes);

  const definirModoEstante = (modo: ModoEstante): void => {
    setModoEstante(modo);
    salvarModoEstante(modo);
  };

  useEffect(() => {
    setLivros(
      (opcoes.dados?.livros ?? []).map((l) => ({
        id: l.id,
        titulo: l.titulo,
        autor: l.autor ?? "",
        imagem: l.imagem ?? "",
        md5: l.md5 ?? "",
        removerImagem: false,
        oculto: l.oculto ?? false,
      })),
    );
  }, [opcoes.dados]);

  const atualizar = (i: number, patch: Partial<ItemLivro>): void => {
    setLivros((ls) =>
      ls.map((li, idx) => (idx === i ? { ...li, ...patch } : li)),
    );
  };

  const trocarImagem = (i: number, file: File | undefined): void => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const resultado = reader.result;
      if (typeof resultado === "string") {
        atualizar(i, { imagem: resultado, removerImagem: false });
      }
    };
    reader.readAsDataURL(file);
  };

  const removerCapa = (i: number): void => {
    atualizar(i, { imagem: "", removerImagem: true });
  };

  const abrirEdicao = (i: number): void => {
    setEditando(i);
  };

  // Fecha o editor; descarta um livro novo que ficou em branco (sem título/md5).
  const fecharEdicao = (): void => {
    const i = editando;
    setEditando(null);
    if (i === null) return;
    setLivros((ls) => {
      const li = ls[i];
      if (li && li.id === null && li.titulo.trim() === "" && li.md5.trim() === "") {
        return ls.filter((_, idx) => idx !== i);
      }
      return ls;
    });
  };

  const editarCampo = (patch: Partial<ItemLivro>): void => {
    if (editando === null) return;
    atualizar(editando, patch);
  };

  const editarImagem = (file: File | undefined): void => {
    if (editando === null) return;
    trocarImagem(editando, file);
  };

  const removerCapaAtual = (): void => {
    if (editando === null) return;
    removerCapa(editando);
  };

  const removerAtual = (): void => {
    if (editando === null) return;
    const li = livros[editando];
    if (li && li.id !== null && !confirm(`Remover o livro "${li.titulo}"?`)) {
      return;
    }
    setEditando(null);
    setLivros((ls) => ls.filter((_, idx) => idx !== editando));
  };

  const mover = (i: number, delta: number): void => {
    setLivros((ls) => {
      const j = i + delta;
      if (j < 0 || j >= ls.length) return ls;
      const next = [...ls];
      const temp = next[i];
      if (temp === undefined) return ls;
      const alvo = next[j];
      if (alvo === undefined) return ls;
      next[i] = alvo;
      next[j] = temp;
      return next;
    });
  };

  const adicionar = (): void => {
    setEditando(livros.length);
    setLivros((ls) => [
      ...ls,
      {
        id: null,
        titulo: "",
        autor: "",
        imagem: "",
        md5: "",
        removerImagem: false,
        oculto: false,
      },
    ]);
  };

  const salvar = async (): Promise<void> => {
    const validos = livros
      .filter((li) => {
        const md5 = (li.md5 ?? "").trim().toLowerCase();
        const titulo = (li.titulo ?? "").trim();
        return titulo !== "" && /^[0-9a-f]{32}$/.test(md5);
      })
      .map((li) => ({
        titulo: li.titulo.trim(),
        autor: li.autor.trim(),
        imagem: li.imagem ?? "",
        md5: li.md5.trim().toLowerCase(),
        remover_imagem: li.removerImagem,
        oculto: li.oculto,
      }));

    const res = await apiSalvarConfig(validos);
    if (res.ok) {
      setMensagem({ ok: true, texto: "✓ Configuração salva!" });
      setEditando(null);
      setLivros(
        (res.livros ?? []).map((l) => ({
          id: l.id,
          titulo: l.titulo,
          autor: l.autor ?? "",
          imagem: l.imagem ?? "",
          md5: l.md5 ?? "",
          removerImagem: false,
          oculto: l.oculto ?? false,
        })),
      );
    } else {
      setMensagem({ ok: false, texto: "Erro: " + (res.error || "desconhecido") });
    }
  };

  return (
    <div>
      <header className="mb-7">
        <span className="eyebrow">Configuração</span>
        <h1 className="titulo-pag">Mapa de livros</h1>
      </header>

      {opcoes.carregando ? (
        <div className="card mb-6 p-8 text-center text-sm text-tinta-2">
          Carregando…
        </div>
      ) : null}
      {opcoes.erro ? (
        <BannerErro texto={opcoes.erro} aoTentar={opcoes.recarregar} />
      ) : null}

      <div className="card mb-6">
        <div className="border-b border-linha px-5 py-4">
          <h2 className="text-base font-semibold text-tinta">
            Livros mapeados
          </h2>
          <p className="mt-0.5 text-sm text-tinta-2">
            Reordene os livros pelas setas ou clique em um livro para ajustar
            título, autor, md5 e capa. Livros novos são cadastrados
            automaticamente na primeira leitura enviada pelo plugin.
          </p>
        </div>
        <div className="p-4">
          {livros.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-tinta-2">
              Nenhum livro cadastrado.
            </div>
          )}
          <div className="space-y-2">
            {livros.map((li, i) => {
              const src = coverSrc(li.imagem);
              return (
                <div
                  key={li.id ?? `novo-${i}`}
                  className="card flex items-center gap-3 p-3"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => abrirEdicao(i)}
                    title={`Configurar ${li.titulo || "livro"}`}
                  >
                    <div className="h-14 w-10 shrink-0 overflow-hidden rounded border border-linha bg-papel">
                      {src ? (
                        <img
                          src={src}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-center text-[0.5rem] leading-tight text-tinta-3">
                          sem capa
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-semibold text-tinta">
                        <span className="truncate">
                          {li.titulo.trim() || "Sem título"}
                        </span>
                        {li.oculto ? (
                          <span className="badge shrink-0 bg-papel-3 text-tinta-2">
                            escondido
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-tinta-2">
                        {li.autor.trim() || "sem autor"}
                      </p>
                      <p className="truncate font-mono text-[0.65rem] text-tinta-3">
                        {li.md5.trim() || "md5 não definido"}
                      </p>
                    </div>
                    <span className="shrink-0 text-tinta-3" aria-hidden>
                      ›
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="btn btn-outline h-8 w-8 px-0 text-xs"
                      disabled={i === 0}
                      onClick={() => mover(i, -1)}
                      title="Mover para cima"
                      aria-label="Mover para cima"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline h-8 w-8 px-0 text-xs"
                      disabled={i === livros.length - 1}
                      onClick={() => mover(i, 1)}
                      title="Mover para baixo"
                      aria-label="Mover para baixo"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn btn-outline mt-2" onClick={adicionar}>
            + Adicionar livro
          </button>
        </div>
      </div>

      <div className="card mb-6">
        <div className="border-b border-linha px-5 py-4">
          <h2 className="text-base font-semibold text-tinta">
            Aparência da estante
          </h2>
          <p className="mt-0.5 text-sm text-tinta-2">
            Como os livros são exibidos na estante (início).
          </p>
        </div>
        <div className="flex gap-3 p-4">
          <button
            type="button"
            onClick={() => definirModoEstante("tabela")}
            className={`btn h-10 flex-1 ${modoEstante === "tabela" ? "btn-primario" : "btn-outline"}`}
            title="Exibição atual em lista"
          >
            {modoEstante === "tabela" ? "✓ " : ""}Por tabela
          </button>
          <button
            type="button"
            onClick={() => definirModoEstante("imagem")}
            className={`btn h-10 flex-1 ${modoEstante === "imagem" ? "btn-primario" : "btn-outline"}`}
            title="Exibição com capas dos livros"
          >
            {modoEstante === "imagem" ? "✓ " : "▦ "}Por imagem
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primario h-11 w-full text-base"
        onClick={salvar}
      >
        Salvar configuração
      </button>
      <p
        className={`mt-3 min-h-[1.2em] text-center text-sm font-medium ${
          mensagem
            ? mensagem.ok
              ? "text-green-700 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
            : ""
        }`}
        aria-live="polite"
      >
        {mensagem?.texto ?? ""}
      </p>

      <Modal
        open={editando !== null && livros[editando] !== undefined}
        onClose={fecharEdicao}
        title={livros[editando ?? 0]?.id ? "Editar livro" : "Novo livro"}
        footer={
          <div className="flex items-center justify-between gap-2 border-t border-linha px-4 py-3">
            <button
              type="button"
              className="btn btn-suave text-red-600 hover:text-red-700 dark:text-red-400"
              onClick={removerAtual}
            >
              Remover
            </button>
            <button type="button" className="btn btn-primario" onClick={fecharEdicao}>
              Concluir
            </button>
          </div>
        }
      >
        {editando !== null && livros[editando] ? (
          <EditorLivro
            item={livros[editando]!}
            onChange={editarCampo}
            onTrocarImagem={editarImagem}
            onRemoverCapa={removerCapaAtual}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function EditorLivro({
  item,
  onChange,
  onTrocarImagem,
  onRemoverCapa,
}: {
  item: ItemLivro;
  onChange: (patch: Partial<ItemLivro>) => void;
  onTrocarImagem: (file: File | undefined) => void;
  onRemoverCapa: () => void;
}) {
  const src = coverSrc(item.imagem);
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="ed-titulo" className="label">
          Título
        </label>
        <input
          id="ed-titulo"
          type="text"
          className="input"
          value={item.titulo}
          onChange={(e) => onChange({ titulo: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor="ed-autor" className="label">
          Autor
        </label>
        <input
          id="ed-autor"
          type="text"
          className="input"
          value={item.autor}
          onChange={(e) => onChange({ autor: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor="ed-md5" className="label">
          md5
        </label>
        <input
          id="ed-md5"
          type="text"
          className="input font-mono"
          placeholder="32 caracteres hexadecimais"
          value={item.md5}
          onChange={(e) => onChange({ md5: e.target.value })}
        />
      </div>
      <div>
        <span className="label">Capa</span>
        <div className="flex items-center gap-3">
          <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md border border-linha bg-papel">
            {src ? (
              <img
                src={src}
                alt={`Capa de ${item.titulo || "livro"}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-center text-[0.6rem] text-tinta-3">
                sem capa
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn btn-outline cursor-pointer">
              {src ? "Trocar imagem" : "Enviar imagem"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onClick={(e) => {
                  e.currentTarget.value = "";
                }}
                onChange={(e) => onTrocarImagem(e.target.files?.[0])}
              />
            </label>
            {item.imagem ? (
              <button
                type="button"
                className="btn btn-suave text-red-600 hover:text-red-700 dark:text-red-400"
                onClick={onRemoverCapa}
              >
                Remover capa
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-linha-2 px-3 py-2.5">
        <span className="text-sm text-tinta">
          Esconder da estante
          <span className="mt-0.5 block text-xs text-tinta-2">
            Não aparece na estante, mas continua nas estatísticas.
          </span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-fita"
          checked={item.oculto}
          onChange={(e) => onChange({ oculto: e.target.checked })}
        />
      </label>
    </div>
  );
}