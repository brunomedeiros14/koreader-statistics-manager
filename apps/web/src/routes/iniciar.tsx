import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { apiBuscarUltimaLeitura, apiGetOpcoes } from "../api";
import { BannerErro } from "../components/BannerErro";
import { useApi } from "../hooks/useApi";
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
  const [pgInicial, setPgInicial] = useState("1");
  const [inicio, setInicio] = useState(agoraLocal);
  const [erro, setErro] = useState("");
  const opcoes = useApi(apiGetOpcoes);

  const livros = opcoes.dados?.livros ?? [];
  const livroAtivo =
    livros.find((l) => l.id === Number(livro)) ?? livros[0] ?? null;

  useEffect(() => {
    if (!livroAtivo?.md5) return;
    setPgInicial("1");
    apiBuscarUltimaLeitura(livroAtivo.md5)
      .then((data) => {
        const ultimo = data.registros?.[0];
        if (!ultimo) return;
        const total = Math.max(1, Number(ultimo.numero_3) || 1);
        const iniciar = Math.min(Math.max(1, Number(ultimo.numero_2)), total);
        setPgInicial(String(iniciar));
      })
      .catch(() => undefined);
  }, [livroAtivo?.md5, livroAtivo?.id]);

  const ajustarPagina = (delta: number): void => {
    setPgInicial((v) => {
      const n = parseInt(v, 10);
      const base = isNaN(n) ? 1 : n;
      return String(Math.max(1, base + delta));
    });
    setErro("");
  };

  if (livros.length > 0 && !livroAtivo) {
    return (
      <div className="card p-6 text-sm text-tinta-2">
        Livro não encontrado.{" "}
        <a href="/" className="text-fita underline underline-offset-4">
          Voltar para a estante
        </a>
        .
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
        'Já existe uma leitura ativa de "' +
          ativa.titulo +
          '". Descartar e começar uma nova?',
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
    <div>
      <header className="mb-7">
        <span className="eyebrow">Iniciar leitura</span>
        <h1 className="titulo-pag">O livro em aberto</h1>
      </header>

      <section className="card mb-6">
        <div className="border-b border-linha px-5 py-3">
          <h2 className="text-sm font-semibold text-tinta">Livro</h2>
        </div>
        <div className="p-4 text-sm text-tinta">
          {opcoes.erro ? (
            <BannerErro texto={opcoes.erro} aoTentar={opcoes.recarregar} />
          ) : livroAtivo ? (
            livroAtivo.titulo
          ) : (
            <span className="text-tinta-2">Carregando livros…</span>
          )}
        </div>
      </section>

      {opcoes.erro ? null : (
        <section className="card mb-6">
          <div className="border-b border-linha px-5 py-3">
            <h2 className="text-sm font-semibold text-tinta">Dados da leitura</h2>
          </div>
          <div className="space-y-4 p-5">
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
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  className="btn btn-outline h-10 shrink-0 px-3"
                  title="Diminuir 5 páginas"
                  aria-label="Diminuir 5 páginas"
                  onClick={() => ajustarPagina(-5)}
                >
                  −5
                </button>
                <button
                  type="button"
                  className="btn btn-outline h-10 shrink-0 px-3"
                  title="Diminuir 1 página"
                  aria-label="Diminuir 1 página"
                  onClick={() => ajustarPagina(-1)}
                >
                  −1
                </button>
                <input
                  type="number"
                  id="pg-inicial"
                  min={1}
                  className="input w-24 shrink-0 text-center"
                  value={pgInicial}
                  onChange={(e) => setPgInicial(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-outline h-10 shrink-0 px-3"
                  title="Aumentar 1 página"
                  aria-label="Aumentar 1 página"
                  onClick={() => ajustarPagina(1)}
                >
                  +1
                </button>
                <button
                  type="button"
                  className="btn btn-outline h-10 shrink-0 px-3"
                  title="Aumentar 5 páginas"
                  aria-label="Aumentar 5 páginas"
                  onClick={() => ajustarPagina(5)}
                >
                  +5
                </button>
              </div>
              <p className="mt-1.5 min-h-[1.2em] text-xs font-medium text-red-600 dark:text-red-400">
                {erro}
              </p>
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        className="btn btn-primario h-11 w-full text-base"
        onClick={iniciar}
        disabled={!livroAtivo || opcoes.erro !== null}
      >
        Iniciar leitura
      </button>
    </div>
  );
}