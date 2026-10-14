import { createPortal } from "react-dom";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

const ITENS = [
  { para: "/", rotulo: "Estante" },
  { para: "/registros", rotulo: "Registros" },
  { para: "/estatisticas", rotulo: "Estatísticas" },
  { para: "/calendario", rotulo: "Calendário" },
  { para: "/config", rotulo: "Configuração" },
] as const;

function Marca() {
  return (
    <span className="text-sm font-bold tracking-tight text-tinta">
      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-fita align-middle" />
      Leitura Manual
    </span>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setAberto(false);
    };
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aberto]);

  const ativo = (para: string): boolean => pathname === para;

  return (
    <>
      <header
        className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-linha bg-desk/95 px-4 pb-3 backdrop-blur md:hidden"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          className="btn-icone h-10 w-10"
          aria-label="Abrir menu"
          aria-expanded={aberto}
          onClick={() => setAberto(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Marca />
        <span className="h-10 w-10" aria-hidden />
      </header>

      <aside className="hidden border-r border-linha px-8 py-10 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:gap-10">
        <Marca />
        <nav className="flex flex-col gap-3">
          {ITENS.map((item) => {
            const ehAtivo = ativo(item.para);
            return (
              <Link
                key={item.para}
                to={item.para}
                className={
                  "relative w-fit after:absolute after:-bottom-0.5 after:left-0 after:h-0.5 after:w-6 after:rounded-sm after:bg-linha-2 after:transition-opacity after:opacity-0 hover:after:opacity-100 " +
                  (ehAtivo
                    ? "text-fita after:bg-fita after:opacity-100"
                    : "text-tinta-2 hover:text-tinta")
                }
              >
                {item.rotulo}
              </Link>
            );
          })}
        </nav>
      </aside>

      {aberto
        ? createPortal(
            <div
              className="fixed inset-0 z-[60] md:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
            >
              <div
                className="absolute inset-0 bg-tinta/40 backdrop-blur-sm"
                onClick={() => setAberto(false)}
              />
              <nav
                className="absolute left-0 top-0 flex h-full w-72 max-w-[82%] flex-col gap-1 overflow-y-auto border-r border-linha bg-papel-2 px-5 shadow-[0_0_40px_rgb(0_0_0/0.35)]"
                style={{
                  paddingTop: "max(1rem, env(safe-area-inset-top))",
                  paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
                }}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Marca />
                  <button
                    type="button"
                    className="btn-icone h-10 w-10"
                    aria-label="Fechar menu"
                    onClick={() => setAberto(false)}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {ITENS.map((item) => {
                  const ehAtivo = ativo(item.para);
                  return (
                    <Link
                      key={item.para}
                      to={item.para}
                      onClick={() => setAberto(false)}
                      className={
                        "rounded-lg px-3 py-3 text-base transition-colors " +
                        (ehAtivo
                          ? "bg-fita-suave font-semibold text-fita"
                          : "text-tinta-2 hover:bg-papel hover:text-tinta")
                      }
                    >
                      {item.rotulo}
                    </Link>
                  );
                })}
              </nav>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
