import type { LeituraRegistro } from "@leitura/common";
import { Info } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { chaveDiaLocal } from "../lib/calendario";
import { fmtDuracao, fmtLocal, minutosEntre } from "../lib/format";
import { Modal } from "./Modal";

const paginasLidas = (r: LeituraRegistro): number | null =>
  r.numero_2 >= r.numero_1 ? r.numero_2 - r.numero_1 + 1 : null;

function Bloco({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="rounded-lg border border-linha bg-papel px-3 py-2 text-center">
      <div className="font-mono text-sm font-semibold tabular-nums text-tinta">
        {valor}
      </div>
      <div className="mt-0.5 text-[0.6rem] uppercase tracking-widest text-tinta-3">
        {rotulo}
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <dt className="text-xs text-tinta-3">{rotulo}</dt>
      <dd className="text-right text-sm tabular-nums text-tinta">{valor}</dd>
    </div>
  );
}

export function DetalhesSessao({ registro }: { registro: LeituraRegistro }) {
  const [aberto, setAberto] = useState(false);

  const inicio = new Date(registro.data_hora_1);
  const fim = new Date(registro.data_hora_2);
  const minutos = minutosEntre(registro.data_hora_1, registro.data_hora_2);
  const paginas = paginasLidas(registro);
  const velocidade =
    paginas !== null && minutos > 0
      ? (paginas / minutos).toLocaleString("pt-BR", {
          maximumFractionDigits: 1,
        }) + " p/min"
      : "—";
  const cruzou = chaveDiaLocal(inicio) !== chaveDiaLocal(fim);

  const fechar = (): void => setAberto(false);

  return (
    <>
      <button
        type="button"
        className="btn-icone"
        title="Detalhes da leitura"
        aria-label="Detalhes da leitura"
        onClick={() => setAberto(true)}
      >
        <Info className="h-4 w-4" />
      </button>

      <Modal
        open={aberto}
        onClose={fechar}
        title={registro.titulo || "Detalhes da leitura"}
        footer={
          <div className="flex items-center justify-between gap-2 border-t border-linha px-4 py-3">
            {registro.md5 ? (
              <Link
                to="/registros"
                search={{ md5: registro.md5 }}
                className="btn btn-outline h-8 px-3"
                onClick={fechar}
              >
                Ver registros do livro
              </Link>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="btn btn-primario h-8 px-3"
              onClick={fechar}
            >
              Fechar
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Bloco rotulo="Duração" valor={fmtDuracao(minutos)} />
            <Bloco rotulo="Velocidade" valor={velocidade} />
            <Bloco rotulo="Páginas lidas" valor={paginas ?? "—"} />
          </div>

          {cruzou ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300">
              Esta sessão atravessou a meia-noite — começou em{" "}
              {fmtLocal(registro.data_hora_1)} e terminou em{" "}
              {fmtLocal(registro.data_hora_2)}, contando nos dois dias.
            </div>
          ) : null}

          <dl className="divide-y divide-linha rounded-lg border border-linha">
            <Linha rotulo="Início" valor={fmtLocal(registro.data_hora_1)} />
            <Linha rotulo="Fim" valor={fmtLocal(registro.data_hora_2)} />
            <Linha
              rotulo="Páginas"
              valor={`${registro.numero_1} → ${registro.numero_2} de ${registro.numero_3}`}
            />
            <Linha rotulo="Origem" valor={registro.origem || "—"} />
            <Linha
              rotulo="Atualizado"
              valor={registro.updated_at ? fmtLocal(registro.updated_at) : "—"}
            />
            <Linha rotulo="Registro" valor={`#${registro.id}`} />
          </dl>
        </div>
      </Modal>
    </>
  );
}
