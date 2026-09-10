import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { apiGetOpcoes, apiSalvarConfig } from "../api";

export const Route = createFileRoute("/config")({ component: ConfigPage });

interface ItemLivro {
  id: number | null;
  titulo: string;
  md5: string;
}

interface Mensagem {
  ok: boolean;
  texto: string;
}

function ConfigPage() {
  const [livros, setLivros] = useState<ItemLivro[]>([]);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  useEffect(() => {
    apiGetOpcoes()
      .then((data) =>
        setLivros(
          (data.livros ?? []).map((l) => ({
            id: l.id,
            titulo: l.titulo,
            md5: l.md5 ?? "",
          })),
        ),
      )
      .catch(() => setLivros([]));
  }, []);

  const atualizar = (i: number, patch: Partial<ItemLivro>): void => {
    setLivros((ls) => ls.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
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

  const remover = (i: number): void => {
    setLivros((ls) => ls.filter((_, idx) => idx !== i));
  };

  const adicionar = (): void => {
    setLivros((ls) => [...ls, { id: null, titulo: "", md5: "" }]);
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
        md5: li.md5.trim().toLowerCase(),
      }));

    const res = await apiSalvarConfig(validos);
    if (res.ok) {
      setMensagem({ ok: true, texto: "✓ Configuração salva!" });
      setLivros(
        (res.livros ?? []).map((l) => ({
          id: l.id,
          titulo: l.titulo,
          md5: l.md5 ?? "",
        })),
      );
    } else {
      setMensagem({ ok: false, texto: "Erro: " + (res.error || "desconhecido") });
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Configuração</h1>
        <Link
          to="/registros"
          className="text-sm text-neutral-500 dark:text-neutral-400 underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 hover:underline"
        >
          ← Registros
        </Link>
      </div>

      <div className="card mb-6">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <h2 className="text-base font-semibold">Livros mapeados</h2>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            Título + md5 conhecidos pelo servidor. Livros novos são cadastrados
            automaticamente na primeira leitura enviada pelo plugin.
          </p>
        </div>
        <div className="p-4">
          {livros.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Nenhum livro cadastrado.
            </div>
          )}
          {livros.map((li, i) => {
            const cimaDesabilitado = i === 0;
            const baixoDesabilitado = i === livros.length - 1;
            return (
              <div key={li.id ?? `novo-${i}`} className="card mb-3 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      className="btn btn-ghost h-6 w-6 px-0 text-xs"
                      disabled={cimaDesabilitado}
                      onClick={() => mover(i, -1)}
                      title="Mover para cima"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost h-6 w-6 px-0 text-xs"
                      disabled={baixoDesabilitado}
                      onClick={() => mover(i, 1)}
                      title="Mover para baixo"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Título"
                      value={li.titulo}
                      onChange={(e) => atualizar(i, { titulo: e.target.value })}
                      className="input input-titulo"
                    />
                    <input
                      type="text"
                      placeholder="md5 (32 hex)"
                      value={li.md5}
                      onChange={(e) => atualizar(i, { md5: e.target.value })}
                      className="input font-mono input-md5"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost h-9 w-9 px-0 text-base"
                    onClick={() => remover(i)}
                    title="Remover"
                    aria-label="Remover livro"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
          <button type="button" className="btn btn-outline mt-2" onClick={adicionar}>
            + Adicionar livro
          </button>
        </div>
      </div>

      <button type="button" className="btn btn-primary h-11 w-full text-base" onClick={salvar}>
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
    </div>
  );
}