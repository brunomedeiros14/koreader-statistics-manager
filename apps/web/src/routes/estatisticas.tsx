import { Link, createFileRoute } from "@tanstack/react-router";

import { apiStats } from "../api";
import { BannerErro } from "../components/BannerErro";
import {
  SerieComBarras,
  StatCard,
  type SerieItem,
} from "../components/StatPaineis";
import { useApi } from "../hooks/useApi";
import { fmtDuracao, fmtInt } from "../lib/format";

export const Route = createFileRoute("/estatisticas")({
  component: EstatisticasPage,
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
  const stats = useApi(apiStats);
  const dados = stats.dados;

  return (
    <div>
      <header className="mb-7">
        <span className="eyebrow">Estatísticas</span>
        <h1 className="titulo-pag">Seu ritmo</h1>
        <p className="mt-1 text-sm text-tinta-2">
          O que o caderno soma — sem excesso.
        </p>
      </header>

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="border-b border-linha px-4 py-3">
            <h2 className="text-sm font-semibold text-tinta">Por mês</h2>
          </div>
          <SerieComBarras itens={porMesItems(dados?.por_mes ?? [])} />
        </div>
        <div className="card">
          <div className="border-b border-linha px-4 py-3">
            <h2 className="text-sm font-semibold text-tinta">Por livro</h2>
          </div>
          <SerieComBarras itens={porLivroItems(dados?.por_tipo ?? [])} />
        </div>
      </div>

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
          className="text-fita underline underline-offset-4 hover:text-fita-2"
        >
          veja o histórico completo
        </Link>
        .
      </footer>
    </div>
  );
}