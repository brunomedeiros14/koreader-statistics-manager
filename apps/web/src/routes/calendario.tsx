import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { apiListaLeitura } from "../api";
import { BannerErro } from "../components/BannerErro";
import { useApi } from "../hooks/useApi";
import { minutosPorDiaLocal } from "../lib/calendario";
import { fmtDia, fmtDuracao, paraUtcData } from "../lib/format";

export const Route = createFileRoute("/calendario")({
  component: CalendarioPage,
});

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const POR_PAGINA = 500;

function CalendarioPage() {
  const hoje = new Date();
  const [visor, setVisor] = useState({
    ano: hoje.getFullYear(),
    mes: hoje.getMonth(),
  });
  const { ano, mes } = visor;
  const pad = (n: number): string => String(n).padStart(2, "0");
  const prefixo = `${ano}-${pad(mes + 1)}`;
  const chave = (d: number): string => `${prefixo}-${pad(d)}`;

  // Busca os registros que tocam o mês visível (com um dia de folga em cada
  // ponta, para sessões que atravessam a virada do mês) e agrupa no fuso local.
  const carrega = useCallback(async () => {
    const inicio = new Date(ano, mes, 0);
    const fim = new Date(ano, mes + 1, 2);
    const base = {
      data_inicio: paraUtcData(inicio),
      data_fim: paraUtcData(fim),
      sort: "data_hora_1",
      dir: "asc",
    };
    const primeira = await apiListaLeitura(
      new URLSearchParams({ ...base, page: "1", limit: String(POR_PAGINA) }),
    );
    const registros = [...(primeira.registros ?? [])];
    for (let p = 2; p <= (primeira.pages ?? 1); p++) {
      const prox = await apiListaLeitura(
        new URLSearchParams({ ...base, page: String(p), limit: String(POR_PAGINA) }),
      );
      registros.push(...(prox.registros ?? []));
    }
    return registros;
  }, [ano, mes]);

  const leituras = useApi(carrega, [carrega]);
  const minutosPorDia = useMemo(
    () => minutosPorDiaLocal(leituras.dados ?? []),
    [leituras.dados],
  );

  let minMes = 0;
  let diasLidos = 0;
  for (const [dia, minutos] of minutosPorDia) {
    if (!dia.startsWith(prefixo)) continue;
    minMes += minutos;
    diasLidos += 1;
  }

  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const offset = new Date(ano, mes, 1).getDay();
  const chaveHoje = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
  const noMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth();

  const mudarMes = (delta: number): void => {
    setVisor((v) => {
      const d = new Date(v.ano, v.mes + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  };

  const irHoje = (): void => {
    setVisor({ ano: hoje.getFullYear(), mes: hoje.getMonth() });
  };

  const celulas: ReactNode[] = [];
  for (let i = 0; i < offset; i++) {
    celulas.push(<span key={`vazio-${i}`} className="invisible" />);
  }
  for (let d = 1; d <= diasNoMes; d++) {
    const k = chave(d);
    const minutos = minutosPorDia.get(k);
    const lido = minutos !== undefined;
    const ehHoje = k === chaveHoje;
    const tempo = minutos !== undefined ? `${Math.round(minutos)}'` : "sem leitura";
    celulas.push(
      <Link
        key={d}
        to="/estatisticas"
        search={{ dia: k }}
        title={`Ver estatísticas de ${fmtDia(k)} — ${tempo}`}
        aria-label={`Ver estatísticas de ${fmtDia(k)}`}
        className={
          "flex h-11 flex-col items-center justify-center gap-1 rounded-lg font-mono text-xs transition-colors md:h-14 md:text-sm " +
          (lido
            ? "bg-fita-suave text-tinta hover:bg-fita/20"
            : "text-tinta-2 hover:bg-papel-3")
        }
      >
        <span
          className={
            "flex h-7 w-7 items-center justify-center rounded-full md:h-8 md:w-8 " +
            (lido
              ? "ring-2 ring-fita"
              : ehHoje
                ? "border border-dashed border-tinta-3"
                : "")
          }
        >
          {d}
        </span>
        <span className="text-[0.56rem] leading-none text-tinta-2">
          {minutos !== undefined ? `${Math.round(minutos)}'` : "\u00a0"}
        </span>
      </Link>,
    );
  }

  const nomeMes = new Date(ano, mes, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div>
      <header className="mb-7">
        <span className="eyebrow">Calendário</span>
        <h1 className="titulo-pag">O mês em círculos</h1>
      </header>

      {leituras.carregando ? (
        <div className="card mb-6 p-8 text-center text-sm text-tinta-2">
          Carregando…
        </div>
      ) : null}
      {leituras.erro ? (
        <BannerErro texto={leituras.erro} aoTentar={leituras.recarregar} />
      ) : null}

      <div className="card p-4 md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b-2 border-linha-2 pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-icone"
              title="Mês anterior"
              aria-label="Mês anterior"
              onClick={() => mudarMes(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="min-w-[8rem] text-center text-base font-bold text-tinta md:min-w-[10rem] md:text-lg">
              {nomeMes}
            </h2>
            <button
              type="button"
              className="btn-icone"
              title="Próximo mês"
              aria-label="Próximo mês"
              onClick={() => mudarMes(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {!noMesAtual ? (
              <button
                type="button"
                className="btn btn-suave h-8 px-2 text-xs"
                onClick={irHoje}
              >
                Hoje
              </button>
            ) : null}
          </div>
          <p className="font-mono text-xs text-tinta-2">
            {fmtDuracao(minMes)} · {diasLidos}{" "}
            {diasLidos === 1 ? "dia com leitura" : "dias com leitura"}
          </p>
        </div>

        <div className="grid grid-cols-7 gap-1 md:gap-1.5">
          {DIAS_SEMANA.map((d) => (
            <span
              key={d}
              className="pb-2 text-center font-mono text-[0.6rem] uppercase tracking-widest text-tinta-3"
            >
              {d}
            </span>
          ))}
          {celulas}
        </div>

        <div className="mt-5 flex flex-wrap gap-4 border-t border-linha pt-4 font-mono text-xs text-tinta-3">
          <span>círculo = dia lido</span>
          <span>tracejado = hoje</span>
          <span>min' = tempo daquela noite</span>
        </div>
      </div>

      <p className="mt-5 text-sm text-tinta-2">
        A sequência vale mais que o recorde — pular um dia não desata nada.{" "}
        <Link
          to="/registros"
          search={{}}
          className="text-fita underline underline-offset-4 hover:text-fita-2"
        >
          ver os registros
        </Link>
        .
      </p>
    </div>
  );
}