import type { Livro } from "@leitura/common";
import { Play, Plus } from "lucide-react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { apiBuscarUltimaLeitura, apiGetOpcoes, apiPostLeitura } from "../api";
import { Modal } from "../components/Modal";
import {
  carregarSessao,
  descartarSessao,
  type SessaoLeitura,
} from "../sessao";
import { agoraLocal, fmtLocal, fmtTempo, uid } from "../util";

export const Route = createFileRoute("/")({ component: HomePage });

const POR_PAGINA = 8;

function NavLinks() {
  return (
    <div className="flex items-center gap-4 text-sm">
      <Link
        to="/registros"
        className="text-neutral-500 dark:text-neutral-400 underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 hover:underline"
      >
        Registros
      </Link>
      <Link
        to="/config"
        className="text-neutral-500 dark:text-neutral-400 underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 hover:underline"
      >
        Configuração
      </Link>
    </div>
  );
}

function HomePage() {
  const [sessao, setSessao] = useState<SessaoLeitura | null>(() =>
    carregarSessao(),
  );
  const [aviso, setAviso] = useState("");

  const mostrarAviso = (msg: string): void => {
    setAviso(msg);
    window.setTimeout(() => setAviso(""), 5000);
  };

  const atualizar = (): void => {
    setSessao(carregarSessao());
  };

  if (sessao) {
    return <LeituraAtiva sessao={sessao} aoEncerrar={atualizar} />;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Estante</h1>
        <NavLinks />
      </div>

      {aviso ? (
        <div className="card mb-4 flex items-center gap-3 border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-4 py-3 text-sm text-green-800 dark:text-green-300">
          <span>✓</span>
          <span>{aviso}</span>
        </div>
      ) : null}

      <section className="card mb-6">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold">Livros cadastrados</h2>
        </div>
        <Estante
          porPagina={POR_PAGINA}
          aoAviso={(msg) => {
            setAviso("");
            mostrarAviso(msg);
          }}
        />
      </section>
    </div>
  );
}

function Estante({
  porPagina,
  aoAviso,
}: {
  porPagina: number;
  aoAviso: (msg: string) => void;
}) {
  const navigate = useNavigate();
  const [livros, setLivros] = useState<Livro[]>([]);
  const [paginaAtual, setPaginaAtual] = useState(1);

  useEffect(() => {
    apiGetOpcoes()
      .then((data) => setLivros(data.livros ?? []))
      .catch(() => setLivros([]));
  }, []);

  const totalPaginas = Math.max(1, Math.ceil(livros.length / porPagina));
  const paginaClamp = Math.min(paginaAtual, totalPaginas);
  const inicio = (paginaClamp - 1) * porPagina;
  const fim = Math.min(inicio + porPagina, livros.length);
  const visiveis = livros.slice(inicio, fim);

  if (livros.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">
        Nenhum livro cadastrado. Cadastre livros em{" "}
        <Link
          to="/config"
          className="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Configuração
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="p-1.5">
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {visiveis.map((li) => (
          <li
            key={li.id}
            className="flex items-center justify-between gap-3 px-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {li.titulo}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                  type="button"
                  className="btn btn-primary h-8 w-8 px-0"
                  title="Iniciar leitura"
                  aria-label="Iniciar leitura"
                  onClick={() => navigate({ to: "/iniciar", search: { livro: String(li.id) } })}
                >
                  <Play className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="btn btn-outline h-8 w-8 px-0"
                  title="Adicionar leitura"
                  aria-label="Adicionar leitura"
                  onClick={() => navigate({ to: "/adicionar", search: { livro: String(li.id) } })}
                >
                  <Plus className="h-4 w-4" />
                </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800 px-2 pt-2 text-xs text-neutral-500 dark:text-neutral-400">
        <button
          type="button"
          className="btn btn-outline h-8 px-3"
          disabled={paginaClamp <= 1}
          onClick={() => setPaginaAtual(paginaClamp - 1)}
        >
          ‹ Anterior
        </button>
        <span>
          Página {paginaClamp} de {totalPaginas}
        </span>
        <button
          type="button"
          className="btn btn-outline h-8 px-3"
          disabled={paginaClamp >= totalPaginas}
          onClick={() => setPaginaAtual(paginaClamp + 1)}
        >
          Próxima ›
        </button>
      </div>
    </div>
  );
}

function LeituraAtiva({
  sessao,
  aoEncerrar,
}: {
  sessao: SessaoLeitura;
  aoEncerrar: () => void;
}) {
  const [agora, setAgora] = useState(() => Date.now());
  const [finalizando, setFinalizando] = useState(false);
  const [num2, setNum2] = useState("");
  const [num3, setNum3] = useState("");
  const [dt2, setDt2] = useState(agoraLocal);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const descartar = (): void => {
    if (!confirm('Descartar a leitura ativa de "' + sessao.titulo + '"?')) return;
    descartarSessao();
    aoEncerrar();
  };

  const abrirFinalizar = (): void => {
    setErros({});
    setNum2(String(sessao.paginaInicial));
    setNum3("");
    setDt2(agoraLocal());
    apiBuscarUltimaLeitura(sessao.md5)
      .then((data) => {
        const ultimo = data.registros?.[0];
        if (!ultimo) return;
        const total = Math.max(1, Number(ultimo.numero_3) || 1);
        setNum3(String(total));
      })
      .catch(() => undefined);
    setFinalizando(true);
  };

  const validar = (): boolean => {
    const n2 = parseInt(num2, 10);
    const n3 = parseInt(num3, 10);
    const bag: Record<string, string> = {};
    if (isNaN(n2) || n2 < 1) bag["num-2"] = "Deve ser inteiro ≥ 1";
    else if (n2 < sessao.paginaInicial)
      bag["num-2"] = "Deve ser maior ou igual à página inicial";
    if (isNaN(n3) || n3 < 1) bag["num-3"] = "Deve ser inteiro ≥ 1";
    if (!dt2 || dt2 <= sessao.inicio)
      bag["dt2"] = "Deve ser posterior ao início da leitura";
    setErros(bag);
    return Object.keys(bag).length === 0;
  };

  const finalizar = async (): Promise<void> => {
    if (!validar()) return;
    const payload = {
      op_id: uid(),
      md5: sessao.md5,
      titulo: sessao.titulo,
      origem: "web" as const,
      data_hora_1: sessao.inicio,
      data_hora_2: dt2,
      numero_1: sessao.paginaInicial,
      numero_2: parseInt(num2, 10),
      numero_3: parseInt(num3, 10),
    };
    try {
      const res = await apiPostLeitura(payload);
      if (!res.ok) {
        alert("Erro: " + res.error);
        return;
      }
      setFinalizando(false);
      descartarSessao();
      aoEncerrar();
    } catch (err) {
      alert("Erro de conexão: " + (err instanceof Error ? err.message : err));
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Leitura atual</h1>
        <NavLinks />
      </div>

      <section className="card mb-6 text-center">
        <div className="px-4 pb-4 pt-6">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Leitura em andamento
          </p>
          <p className="mt-1 break-words text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {sessao.titulo}
          </p>
          <p className="mt-4 font-mono text-4xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">
            {fmtTempo(agora - new Date(sessao.inicio).getTime())}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Início {fmtLocal(sessao.inicio)} · Página inicial {sessao.paginaInicial}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          className="btn btn-outline h-11 text-base"
          onClick={descartar}
        >
          Descartar leitura
        </button>
        <button
          type="button"
          className="btn btn-primary h-11 text-base"
          onClick={abrirFinalizar}
        >
          Finalizar leitura
        </button>
      </div>

      <Modal
        open={finalizando}
        onClose={() => setFinalizando(false)}
        title="Finalizar leitura"
        footer={
          <div className="flex justify-end gap-2 border-t border-neutral-200 dark:border-neutral-800 px-4 py-3">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setFinalizando(false)}
            >
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={finalizar}>
              Salvar leitura
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Livro: <span className="font-medium text-neutral-700 dark:text-neutral-300">{sessao.titulo}</span>
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Página inicial: {sessao.paginaInicial} · Início: {fmtLocal(sessao.inicio)}
            </p>
          </div>
          <div>
            <label htmlFor="fim-pg" className="label">
              Página finalizada
            </label>
            <input
              type="number"
              id="fim-pg"
              min={1}
              className="input"
              value={num2}
              onChange={(e) => setNum2(e.target.value)}
            />
            <p className="mt-1.5 min-h-[1.2em] text-xs font-medium text-red-600 dark:text-red-400">
              {erros["num-2"] ?? ""}
            </p>
          </div>
          <div>
            <label htmlFor="tot-pg" className="label">
              Total de páginas do livro físico
            </label>
            <input
              type="number"
              id="tot-pg"
              min={1}
              className="input"
              value={num3}
              onChange={(e) => setNum3(e.target.value)}
            />
            <p className="mt-1.5 min-h-[1.2em] text-xs font-medium text-red-600 dark:text-red-400">
              {erros["num-3"] ?? ""}
            </p>
          </div>
          <div>
            <label htmlFor="fim-dt" className="label">
              Momento da finalização
            </label>
            <input
              type="datetime-local"
              id="fim-dt"
              className="input"
              value={dt2}
              onChange={(e) => setDt2(e.target.value)}
            />
            <p className="mt-1.5 min-h-[1.2em] text-xs font-medium text-red-600 dark:text-red-400">
              {erros["dt2"] ?? ""}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}