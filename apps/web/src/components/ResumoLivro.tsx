import type { LeituraRegistro } from "@leitura/common";
import { useEffect, useState } from "react";

import { apiListaLeitura } from "../api";
import { fmtDuracao, fmtInt, minutosEntre } from "../lib/format";
import { StatCard } from "./StatPaineis";

interface ResumoLivroData {
  paginasLidas: number;
  tempoTotalMin: number;
  sessoes: number;
  tempoMedioPaginaMin: number | null;
  ultimaPagina: number | null;
  totalPaginas: number | null;
  conclusaoPct: number | null;
}

const resumir = (registros: LeituraRegistro[]): ResumoLivroData => {
  let paginasLidas = 0;
  let tempoTotalMin = 0;
  let ultimaPagina = 0;
  let totalPaginas: number | null = null;
  for (const r of registros) {
    if (r.numero_2 >= r.numero_1) paginasLidas += r.numero_2 - r.numero_1 + 1;
    tempoTotalMin += minutosEntre(r.data_hora_1, r.data_hora_2);
    if (r.numero_2 > ultimaPagina) ultimaPagina = r.numero_2;
    if (r.numero_3 > 0 && totalPaginas === null) totalPaginas = r.numero_3;
  }
  return {
    paginasLidas,
    tempoTotalMin,
    sessoes: registros.length,
    tempoMedioPaginaMin: paginasLidas > 0 ? tempoTotalMin / paginasLidas : null,
    ultimaPagina: ultimaPagina > 0 ? ultimaPagina : null,
    totalPaginas,
    conclusaoPct:
      ultimaPagina > 0 && totalPaginas !== null && totalPaginas > 0
        ? Math.min(100, Math.round((ultimaPagina / totalPaginas) * 100))
        : null,
  };
};

const fmtTempoCurto = (min: number): string => {
  const seg = Math.max(0, Math.round(min * 60));
  if (seg < 60) return seg + "s";
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return s === 0 ? m + "min" : m + "min" + s + "s";
};

export function ResumoLivro({
  md5,
  titulo,
}: {
  md5: string | null;
  titulo: string;
}) {
  const [resumo, setResumo] = useState<ResumoLivroData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    setResumo(null);
    if (!md5) {
      setCarregando(false);
      return;
    }
    apiListaLeitura(
      new URLSearchParams({ md5, limit: "1000", sort: "data_hora_2", dir: "desc" }),
    )
      .then((data) => {
        if (ativo) setResumo(resumir(data.registros ?? []));
      })
      .catch((e: unknown) => {
        if (ativo) setErro(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [md5, titulo]);

  if (carregando) {
    return (
      <div className="rounded-lg border border-dashed border-linha p-4 text-center text-sm text-tinta-3">
        Montando o resumo…
      </div>
    );
  }
  if (erro) {
    return <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>;
  }
  if (!resumo || resumo.sessoes === 0) {
    return (
      <div className="rounded-lg border border-dashed border-linha p-4 text-center text-sm text-tinta-3">
        Ainda sem registros de leitura — o resumo nasce com a primeira leitura.
      </div>
    );
  }

  const ultimaPagina =
    resumo.ultimaPagina !== null
      ? resumo.ultimaPagina +
        (resumo.totalPaginas !== null ? " / " + resumo.totalPaginas : "")
      : "—";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard valor={fmtInt(resumo.paginasLidas)} rotulo="Páginas lidas" />
        <StatCard valor={fmtDuracao(resumo.tempoTotalMin)} rotulo="Tempo total" />
        <StatCard valor={fmtInt(resumo.sessoes)} rotulo="Sessões" />
        <StatCard
          valor={
            resumo.tempoMedioPaginaMin !== null
              ? fmtTempoCurto(resumo.tempoMedioPaginaMin)
              : "—"
          }
          rotulo="Tempo por página"
        />
        <StatCard valor={ultimaPagina} rotulo="Última página" />
        <StatCard
          valor={resumo.conclusaoPct !== null ? resumo.conclusaoPct + "%" : "—"}
          rotulo="Conclusão"
        />
      </div>
      {resumo.conclusaoPct !== null ? (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-papel-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-fita-2 to-fita"
              style={{ width: resumo.conclusaoPct + "%" }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-tinta-3">
            a fita ficou em {resumo.ultimaPagina} de {resumo.totalPaginas}
          </p>
        </div>
      ) : null}
    </div>
  );
}