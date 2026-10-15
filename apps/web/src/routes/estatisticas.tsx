import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { apiListaLeitura, apiStats } from "../api";
import { BannerErro } from "../components/BannerErro";
import { DetalhesSessao } from "../components/DetalhesSessao";
import {
  SerieComBarras,
  StatCard,
  type SerieItem,
} from "../components/StatPaineis";
import { useApi } from "../hooks/useApi";
import { diaDeslocado, intervaloUtcDoDia } from "../lib/calendario";
import { fmtDia, fmtDuracao, fmtHora, fmtInt, minutosEntre } from "../lib/format";

export const Route = createFileRoute("/estatisticas")({
  component: EstatisticasPage,
  validateSearch: (search: Record<string, unknown>) => ({
    dia: typeof search.dia === "string" ? search.dia : undefined,
  }),
});

const mesCurto = (mes: string): string => {
  const m = mes.match(/^(\d{4})-(\d{2})$/);
  if (!m) return mes;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
};

const porLivroItems = (
  porTipo: Array<{ tipo: string | null; n: number; horas: number }>,
): SerieItem[] =>
  porTipo
    .filter((t) => typeof t.tipo === "string" && t.tipo)
    .slice(0, 5)
    .map((t) => ({
      rotulo: t.tipo as string,
      valor: t.n,
      extra: fmtDuracao(t.horas * 60) + " · " + t.n + " leitura" + (t.n === 1 ? "" : "s"),
    }));

const porMesItems = (
  porMes: Array<{ mes: string; n: number; horas: number }>,
): SerieItem[] =>
  porMes.map((m) => ({
    rotulo: mesCurto(m.mes),
    valor: m.n,
    extra: m.n + " · " + fmtDuracao(m.horas * 60),
  }));

function EstatisticasPage() {
  const { dia } = Route.useSearch();
  const intervalo = dia ? intervaloUtcDoDia(dia) : null;
  const params = intervalo
    ? new URLSearchParams({
        data_inicio: intervalo.inicio,
        data_fim: intervalo.fim,
      })
    : undefined;

  const stats = useApi(() => apiStats(params), [dia]);
  const dados = stats.dados;

  const lista = useApi(
    () =>
      intervalo
        ? apiListaLeitura(
            new URLSearchParams({
              data_inicio: intervalo.inicio,
              data_fim: intervalo.fim,
              limit: "500",
              sort: "data_hora_1",
              dir: "asc",
            }),
          )
        : Promise.resolve(null),
    [dia],
  );
  const registros = lista.dados?.registros ?? [];

  const anterior = dia ? diaDeslocado(dia, -1) : null;
  const proximo = dia ? diaDeslocado(dia, 1) : null;

  return (
    <div>
      <header className="mb-7">
        <span className="eyebrow">Estatísticas</span>
        <h1 className="titulo-pag">Seu ritmo</h1>
        <p className="mt-1 text-sm text-tinta-2">
          O que o caderno soma — sem excesso.
        </p>
      </header>

      {dia && intervalo ? (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            <Link
              to="/estatisticas"
              search={{ dia: anterior ?? undefined }}
              className="btn-icone"
              title="Dia anterior"
              aria-label="Dia anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="min-w-[9rem] text-center font-mono text-sm text-tinta">
              {fmtDia(dia)}
            </span>
            <Link
              to="/estatisticas"
              search={{ dia: proximo ?? undefined }}
              className="btn-icone"
              title="Próximo dia"
              aria-label="Próximo dia"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <Link
            to="/estatisticas"
            search={{ dia: undefined }}
            className="btn btn-outline h-8 px-3"
          >
            Ver tudo
          </Link>
        </div>
      ) : null}

      {stats.carregando ? (
        <div className="card mb-6 p-8 text-center text-sm text-tinta-2">
          Carregando…
        </div>
      ) : null}
      {stats.erro ? (
        <BannerErro texto={stats.erro} aoTentar={stats.recarregar} />
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard valor={fmtInt(dados?.total ?? 0)} rotulo="Total de leituras" />
        <StatCard
          valor={fmtDuracao((dados?.duracao_total_horas ?? 0) * 60)}
          rotulo="Tempo total"
        />
        <StatCard
          valor={fmtDuracao((dados?.duracao_media_horas ?? 0) * 60)}
          rotulo="Duração média"
        />
        <StatCard
          valor={fmtInt(dados?.paginas_lidas ?? 0)}
          rotulo="Páginas lidas"
        />
      </div>

      <div
        className={
          "grid grid-cols-1 gap-4 " + (intervalo ? "" : "lg:grid-cols-2")
        }
      >
        {intervalo ? null : (
          <div className="card">
            <div className="border-b border-linha px-4 py-3">
              <h2 className="text-sm font-semibold text-tinta">Por mês</h2>
            </div>
            <SerieComBarras itens={porMesItems(dados?.por_mes ?? [])} />
          </div>
        )}
        <div className="card">
          <div className="border-b border-linha px-4 py-3">
            <h2 className="text-sm font-semibold text-tinta">Por livro</h2>
          </div>
          <SerieComBarras itens={porLivroItems(dados?.por_tipo ?? [])} />
        </div>
      </div>

      {intervalo ? (
        <section className="card mt-6">
          <div className="flex items-center justify-between border-b border-linha px-4 py-3">
            <h2 className="text-sm font-semibold text-tinta">
              Leituras do dia
            </h2>
            <span className="font-mono text-xs text-tinta-3">
              {registros.length}{" "}
              {registros.length === 1 ? "registro" : "registros"}
            </span>
          </div>
          {lista.carregando ? (
            <div className="px-4 py-8 text-center text-sm text-tinta-2">
              Carregando…
            </div>
          ) : registros.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-tinta-2">
              Nenhuma leitura neste dia.
            </div>
          ) : (
            <ul className="divide-y divide-linha">
              {registros.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 px-4 py-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-tinta">
                    {r.titulo || "—"}
                  </span>
                  <span className="font-mono text-xs text-tinta-2">
                    {fmtHora(r.data_hora_1)}–{fmtHora(r.data_hora_2)}
                  </span>
                  <span className="font-mono text-xs text-tinta-2">
                    {fmtDuracao(minutosEntre(r.data_hora_1, r.data_hora_2))}
                  </span>
                  <span className="font-mono text-xs text-tinta-3">
                    p. {r.numero_1}→{r.numero_2}
                  </span>
                  <DetalhesSessao registro={r} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <footer className="mt-8 border-t border-linha pt-4 text-sm text-tinta-3">
        Dia a dia, leve o caderno do mês{" "}
        <Link
          to="/calendario"
          className="text-fita underline underline-offset-4 hover:text-fita-2"
        >
          no calendário
        </Link>
        , ou{" "}
        <Link
          to="/registros"
          search={{}}
          className="text-fita underline underline-offset-4 hover:text-fita-2"
        >
          veja o histórico completo
        </Link>
        .
      </footer>
    </div>
  );
}