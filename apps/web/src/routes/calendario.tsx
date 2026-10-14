import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { apiStats } from "../api";
import { BannerErro } from "../components/BannerErro";
import { useApi } from "../hooks/useApi";
import { fmtDuracao } from "../lib/format";

export const Route = createFileRoute("/calendario")({
  component: CalendarioPage,
});

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function CalendarioPage() {
  const stats = useApi(apiStats);
  const hoje = new Date();
  const [visor, setVisor] = useState({
    ano: hoje.getFullYear(),
    mes: hoje.getMonth(),
  });
  const { ano, mes } = visor;
  const pad = (n: number): string => String(n).padStart(2, "0");
  const prefixo = `${ano}-${pad(mes + 1)}`;
  const chave = (d: number): string => `${prefixo}-${pad(d)}`;

  const minutosPorDia = new Map<string, number>();
  let minMes = 0;
  let diastLidos = 0;
  for (const d of stats.dados?.por_dia ?? []) {
    if (!d.dia.startsWith(prefixo)) continue;
    minutosPorDia.set(d.dia, Math.round(d.horas * 60));
    minMes += Math.round(d.horas * 60);
    diastLidos += 1;
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
    celulas.push(
      <div
        key={d}
        className={
          "flex h-11 flex-col items-center justify-center gap-1 rounded-lg font-mono text-xs md:h-14 md:text-sm " +
          (lido ? "bg-fita-suave text-tinta" : "text-tinta-2")
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
          {lido ? `${minutos}'` : "\u00a0"}
        </span>
      </div>,
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

      {stats.carregando ? (
        <div className="card mb-6 p-8 text-center text-sm text-tinta-2">
          Carregando…
        </div>
      ) : null}
      {stats.erro ? (
        <BannerErro texto={stats.erro} aoTentar={stats.recarregar} />
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
            {fmtDuracao(minMes)} · {diastLidos}{" "}
            {diastLidos === 1 ? "dia com leitura" : "dias com leitura"}
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
          className="text-fita underline underline-offset-4 hover:text-fita-2"
        >
          ver os registros
        </Link>
        .
      </p>
    </div>
  );
}