import type { LeituraRegistro } from "@leitura/common";
import { ChevronDown } from "lucide-react";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { fmtDuracao, fmtLocal as fmt, minutosEntre } from "../lib/format";

const paginasLidas = (r: LeituraRegistro): number | null =>
  r.numero_2 >= r.numero_1 ? r.numero_2 - r.numero_1 + 1 : null;

export function DetalhesSessao({ registro }: { registro: LeituraRegistro }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (): void => setAberto(false);
    const aoClicar = (e: MouseEvent): void => {
      const alvo = e.target as Node;
      if (botaoRef.current?.contains(alvo) || painelRef.current?.contains(alvo)) {
        return;
      }
      setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("resize", fechar);
    window.addEventListener("scroll", fechar, true);
    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("scroll", fechar, true);
    };
  }, [aberto]);

  const alternar = (): void => {
    if (!aberto) {
      const r = botaoRef.current?.getBoundingClientRect();
      if (r) {
        const largura = Math.min(264, window.innerWidth - 16);
        const margem = 8;
        const left = Math.max(
          margem,
          Math.min(r.right - largura, window.innerWidth - largura - margem),
        );
        const altura = 280;
        const abaixo = window.innerHeight - r.bottom;
        const top =
          abaixo < altura + 16
            ? Math.max(margem, r.top - altura - 6)
            : r.bottom + 6;
        setPos({ top, left });
      }
    }
    setAberto((a) => !a);
  };

  const paginas = paginasLidas(registro);
  const minutos = minutosEntre(registro.data_hora_1, registro.data_hora_2);
  const velocidade =
    paginas !== null && minutos > 0
      ? (paginas / minutos).toLocaleString("pt-BR", {
          maximumFractionDigits: 1,
        }) + " p/min"
      : "—";

  const linhas: [string, ReactNode][] = [
    ["ID", registro.id],
    ["Início", fmt(registro.data_hora_1)],
    ["Fim", fmt(registro.data_hora_2)],
    ["Duração", fmtDuracao(minutos)],
    ["Velocidade", velocidade],
    [
      "Páginas",
      `${registro.numero_1} → ${registro.numero_2} de ${registro.numero_3}`,
    ],
    ["Páginas lidas", paginas ?? "—"],
    ["Origem", registro.origem || "—"],
    ["Atualizado", registro.updated_at ? fmt(registro.updated_at) : "—"],
  ];

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        className="btn-icone"
        title="Detalhes da sessão"
        aria-label="Detalhes da sessão"
        aria-expanded={aberto}
        onClick={alternar}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {aberto
        ? createPortal(
            <div
              ref={painelRef}
              role="dialog"
              aria-label="Detalhes da sessão"
              style={{ top: pos.top, left: pos.left }}
              className="fixed z-50 max-h-[70dvh] w-[min(264px,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-linha-2 bg-papel-2 p-3 text-sm shadow-[0_10px_30px_rgb(0_0_0/0.2)]"
            >
              <p className="mb-2 font-mono text-xs uppercase tracking-wide text-tinta-3">
                Detalhes da sessão
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                {linhas.map(([rotulo, valor]) => (
                  <Fragment key={rotulo}>
                    <dt className="text-tinta-3">{rotulo}</dt>
                    <dd className="text-right tabular-nums text-tinta">
                      {valor}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
