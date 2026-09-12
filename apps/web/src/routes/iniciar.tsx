import type { Livro } from "@leitura/common";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { apiBuscarUltimaLeitura, apiGetOpcoes } from "../api";
import { carregarSessao, descartarSessao, salvarSessao } from "../sessao";
import { agoraLocal } from "../util";

export const Route = createFileRoute("/iniciar")({
  component: IniciarPage,
  validateSearch: (search: Record<string, unknown>) => ({
    livro: typeof search.livro === "string" ? search.livro : undefined,
  }),
});

function IniciarPage() {
  const { livro } = Route.useSearch();
  const navigate = useNavigate();
  const [livros, setLivros] = useState<Livro[]>([]);
  const [pgInicial, setPgInicial] = useState("1");
  const [inicio, setInicio] = useState(agoraLocal);
  const [erro, setErro] = useState("");

  const livroAtivo =
    livros.find((l) => l.id === Number(livro)) ?? livros[0] ?? null;

  useEffect(() => {
    apiGetOpcoes()
      .then((data) => setLivros(data.livros ?? []))
      .catch(() => setLivros([]));
  }, []);

  useEffect(() => {
    if (!livroAtivo?.md5) return;
    setPgInicial("1");
    apiBuscarUltimaLeitura(livroAtivo.md5)
      .then((data) => {
        const ultimo = data.registros?.[0];
        if (!ultimo) return;
        const total = Math.max(1, Number(ultimo.numero_3) || 1);
        const iniciar = Math.min(
          Math.max(1, Number(ultimo.numero_2)),
          total,
        );
        setPgInicial(String(iniciar));
      })
      .catch(() => undefined);
  }, [livroAtivo?.md5, livroAtivo?.id]);

  if (livros.length > 0 && !livroAtivo) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="card p-6 text-sm text-neutral-700 dark:text-neutral-300">
          Livro não encontrado.{" "}
          <a href="/" className="text-neutral-500 underline underline-offset-4">
            Voltar para a estante
          </a>
          .
        </div>
      </div>
    );
  }

  const iniciar = (): void => {
    if (!livroAtivo) return;
    const n = parseInt(pgInicial, 10);
    if (isNaN(n) || n < 1) {
      setErro("Página inicial deve ser inteiro ≥ 1");
      return;
    }
    if (!inicio) {
      setErro("Informe o momento de início da leitura");
      return;
    }
    const ativa = carregarSessao();
    if (
      ativa &&
      !confirm(
        "Já existe uma leitura ativa de \"" +
          ativa.titulo +
          "\". Descartar e começar uma nova?",
      )
    ) {
      return;
    }
    descartarSessao();
    salvarSessao({
      livroId: livroAtivo.id,
      md5: livroAtivo.md5 ?? "",
      titulo: livroAtivo.titulo,
      paginaInicial: n,
      inicio,
      criadoEm: Date.now(),
    });
    navigate({ to: "/" });
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Iniciar leitura
        </h1>
        <a
          href="/"
          className="text-sm text-neutral-500 dark:text-neutral-400 underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 hover:underline"
        >
          ← Estante
        </a>
      </div>

      <section className="card mb-6">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold">Livro</h2>
        </div>
        <div className="p-4 text-sm text-neutral-700 dark:text-neutral-300">
          {livroAtivo ? (
            livroAtivo.titulo
          ) : (
            <span className="text-neutral-500 dark:text-neutral-400">
              Carregando livros…
            </span>
          )}
        </div>
      </section>

      <section className="card mb-6">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold">Dados da leitura</h2>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <label htmlFor="inicio" className="label">
              Início da leitura
            </label>
            <input
              type="datetime-local"
              id="inicio"
              className="input"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="pg-inicial" className="label">
              Página inicial da leitura
            </label>
            <input
              type="number"
              id="pg-inicial"
              min={1}
              className="input"
              value={pgInicial}
              onChange={(e) => setPgInicial(e.target.value)}
            />
            <p className="mt-1.5 min-h-[1.2em] text-xs font-medium text-red-600 dark:text-red-400">
              {erro}
            </p>
          </div>
        </div>
      </section>

      <button
        type="button"
        className="btn btn-primary w-full h-11 text-base"
        onClick={iniciar}
        disabled={!livroAtivo}
      >
        Iniciar leitura
      </button>
    </div>
  );
}