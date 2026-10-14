import type { Livro } from "@leitura/common";
import { BookOpen, Play, Plus } from "lucide-react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  apiBuscarUltimaLeitura,
  apiGetOpcoes,
  apiListaLeitura,
  apiPostLeitura,
} from "../api";
import { BannerErro } from "../components/BannerErro";
import { Modal } from "../components/Modal";
import { ResumoLivro } from "../components/ResumoLivro";
import { useApi } from "../hooks/useApi";
import {
  carregarSessao,
  descartarSessao,
  type SessaoLeitura,
} from "../sessao";
import { carregarModoEstante, type ModoEstante } from "../preferencias";
import { coverSrc } from "../lib/cover";
import {
  agoraLocal,
  fmtDuracao,
  fmtLocal,
  fmtTempo,
  minutosEntre,
  paraUtc,
  uid,
} from "../util";

export const Route = createFileRoute("/")({ component: HomePage });

const POR_PAGINA = 8;

interface ProgressoLivro {
  pg: number;
  total: number;
  quando: string;
  min: number;
}

const pctDe = (pg: number, total: number): number =>
  total > 0 ? Math.min(100, Math.round((pg / total) * 100)) : 0;

const hashStr = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const PALETAS = [
  "from-[#3c5a52] to-[#1f332e]",
  "from-[#8a5a3e] to-[#4a2f1e]",
  "from-[#4f4a70] to-[#2a2740]",
  "from-[#a9744c] to-[#5d3a20]",
  "from-[#6d4a2f] to-[#3a2a18]",
] as const;

const capaPaleta = (titulo: string): string =>
  PALETAS[hashStr(titulo) % PALETAS.length] ?? "from-[#3c5a52] to-[#1f332e]";

function CapaLivro({
  titulo,
  imagem,
  pct,
  extraCls,
}: {
  titulo: string;
  imagem: string | null;
  pct: number | null;
  extraCls?: string;
}) {
  const src = coverSrc(imagem);
  return (
    <div
      className={
        "relative aspect-[2/3] overflow-hidden rounded-md bg-papel-2 shadow-[0_8px_18px_rgb(44_38_32/0.25)] " +
        (extraCls ?? "")
      }
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <>
          <div className={"absolute inset-0 bg-gradient-to-br " + capaPaleta(titulo)} />
          <span className="absolute inset-0 z-[1] flex items-center justify-center px-2 text-center text-xs font-semibold leading-snug text-[#fdfaf2] [text-shadow:0_1px_6px_rgb(0_0_0/0.4)]">
            {titulo}
          </span>
        </>
      )}
      {pct !== null && pct > 0 ? (
        <span className="absolute left-0 top-2 z-[2] rounded-r-md bg-gradient-to-b from-fita to-fita-2 px-1.5 py-0.5 text-[0.6rem] font-medium text-[#fdfaf2]">
          {pct}%
        </span>
      ) : null}
    </div>
  );
}

function LivroNaEstante({
  li,
  prog,
  indice,
  aoAbrir,
}: {
  li: Livro;
  prog: ProgressoLivro | undefined;
  indice: number;
  aoAbrir: (li: Livro) => void;
}) {
  const pct = prog ? pctDe(prog.pg, prog.total) : null;
  const rotacao = indice % 2 === 0 ? "-rotate-[0.9deg]" : "rotate-[0.9deg]";
  const detalhe = prog
    ? "na página " +
      prog.pg +
      (prog.min > 0
        ? " · " +
          fmtDuracao(prog.min) +
          " na " +
          new Date(prog.quando).toLocaleDateString("pt-BR", {
            weekday: "long",
          })
        : "")
    : "ainda no início · sem fita";

  return (
    <article className="group flex flex-col gap-2">
      <button
        type="button"
        onClick={() => aoAbrir(li)}
        className={
          "block w-full transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:rotate-0 " +
          rotacao
        }
        title={`Abrir: ${li.titulo}`}
        aria-label={`Abrir: ${li.titulo}`}
      >
        <CapaLivro titulo={li.titulo} imagem={li.imagem} pct={pct} />
      </button>
      <p className="truncate text-sm font-bold text-tinta">{li.titulo}</p>
      <p className="-mt-1.5 text-xs text-tinta-3">{detalhe}</p>
    </article>
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
    <div>
      <Estante
        porPagina={POR_PAGINA}
        aoAviso={(msg) => {
          setAviso("");
          mostrarAviso(msg);
        }}
      />
      {aviso ? (
        <div className="card mb-5 flex items-center gap-3 border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300">
          <span>✓</span>
          <span>{aviso}</span>
        </div>
      ) : null}
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
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [aberto, setAberto] = useState<Livro | null>(null);
  const [modo] = useState<ModoEstante>(() => carregarModoEstante());
  const [progresso, setProgresso] = useState<Map<string, ProgressoLivro>>(
    new Map(),
  );
  const opcoes = useApi(apiGetOpcoes);
  const todosLivros = opcoes.dados?.livros ?? [];
  const livros = todosLivros.filter((l) => !l.oculto);

  const totalPaginas = Math.max(1, Math.ceil(livros.length / porPagina));
  const paginaClamp = Math.min(paginaAtual, totalPaginas);
  const inicio = (paginaClamp - 1) * porPagina;
  const fim = Math.min(inicio + porPagina, livros.length);
  const visiveis = livros.slice(inicio, fim);
  const chaveVisiveis = visiveis.map((l) => l.md5 ?? "").join("|");

  // Última leitura de cada livro da página (para capa % e descrição).
  useEffect(() => {
    let ativo = true;
    setProgresso(new Map());
    const md5s = visiveis
      .map((l) => l.md5)
      .filter((m): m is string => m !== null && m !== undefined);
    if (md5s.length === 0) return;
    Promise.all(
      md5s.map(async (m) => {
        try {
          const data = await apiBuscarUltimaLeitura(m);
          const ultimo = data.registros?.[0];
          if (!ultimo) return undefined;
          return [
            m,
            {
              pg: Math.max(1, Number(ultimo.numero_2) || 1),
              total: Math.max(1, Number(ultimo.numero_3) || 1),
              quando: ultimo.data_hora_2,
              min: minutosEntre(ultimo.data_hora_1, ultimo.data_hora_2),
            },
          ] as const;
        } catch {
          return undefined;
        }
      }),
    ).then((resultados) => {
      if (!ativo) return;
      setProgresso(
        new Map(
          resultados.filter(
            (r): r is readonly [string, ProgressoLivro] => r !== undefined,
          ),
        ),
      );
    });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveVisiveis]);

  // Leitura global mais recente → hero "Pegue onde parou".
  const heroUltima = useApi(() =>
    apiListaLeitura(
      new URLSearchParams({ limit: "1", sort: "data_hora_2", dir: "desc" }),
    ),
  );
  const heroReg = heroUltima.dados?.registros?.[0];
  const heroLivro =
    livros.find((l) => l.md5 === heroReg?.md5) ??
    livros.find((l) => l.titulo === heroReg?.titulo) ??
    null;
  const heroProg =
    heroReg && heroReg.numero_2 > 0
      ? {
          pg: Math.max(1, Number(heroReg.numero_2) || 1),
          total: Math.max(1, Number(heroReg.numero_3) || 1),
          quando: heroReg.data_hora_2,
          min: minutosEntre(heroReg.data_hora_1, heroReg.data_hora_2),
        }
      : null;
  const heroPct = heroProg ? pctDe(heroProg.pg, heroProg.total) : null;

  if (opcoes.erro) {
    return <BannerErro texto={opcoes.erro} aoTentar={opcoes.recarregar} />;
  }

  if (livros.length === 0) {
    return (
      <div className="card p-6 text-sm text-tinta-2">
        {todosLivros.length > 0
          ? "Todos os livros estão escondidos. Gerencie em "
          : "Nenhum livro cadastrado. Cadastre livros em "}
        <Link
          to="/config"
          className="text-fita underline underline-offset-4 hover:text-fita-2"
        >
          Configuração
        </Link>
        .
      </div>
    );
  }

  return (
    <div>
      {heroLivro && heroProg && heroPct ? (
        <header className="mb-6">
          <span className="eyebrow">Pegue onde parou</span>
          <h1 className="titulo-pag break-words">{heroLivro.titulo}</h1>
          <p className="mt-1 text-sm text-tinta-2">
            Página {heroProg.pg} de {heroProg.total} · último registro{" "}
            {fmtLocal(heroProg.quando)}.
          </p>
        </header>
      ) : (
        <header className="mb-7">
          <span className="eyebrow">Estante</span>
          <h1 className="titulo-pag">Seus livros</h1>
          <p className="mt-1 text-sm text-tinta-2">
            Abra um livro e inicie uma leitura.
          </p>
        </header>
      )}

      {heroLivro && heroProg && heroPct ? (
        <section className="card mb-8 flex flex-wrap items-center gap-6 p-5">
          <div className="w-28 shrink-0">
            <CapaLivro
              titulo={heroLivro.titulo}
              imagem={heroLivro.imagem}
              pct={heroPct}
            />
          </div>
          <div className="min-w-[220px] flex-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-papel-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-fita-2 to-fita"
                style={{ width: `${heroPct}%` }}
              />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-tinta-2">
              A fita do marcador ficou na página {heroProg.pg}. O capítulo
              seguinte começa do outro lado da página virada.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link
                to="/iniciar"
                search={{ livro: String(heroLivro.id) }}
                className="btn btn-primario"
              >
                Continuar lendo
              </Link>
              <Link
                to="/adicionar"
                search={{ livro: String(heroLivro.id) }}
                className="btn btn-outline"
              >
                Marcar outra leitura
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {modo === "imagem" ? (
        <>
          <p className="eyebrow mb-4">Sua estante</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
            {visiveis.map((li, i) => (
              <LivroNaEstante
                key={li.id}
                li={li}
                prog={progresso.get(li.md5 ?? "")}
                indice={(paginaClamp - 1) * porPagina + i}
                aoAbrir={setAberto}
              />
            ))}
          </div>
          <p className="mt-6 text-xs text-tinta-3">
            {livros.length}{" "}
            {livros.length === 1
              ? "livro esperando"
              : "livros esperando"}{" "}
            a vez de ser aberto.
          </p>
        </>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-linha">
            {visiveis.map((li) => (
              <li
                key={li.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-tinta">
                    {li.titulo}
                  </p>
                  {li.autor ? (
                    <p className="truncate text-xs text-tinta-3">{li.autor}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="btn btn-outline h-8 w-8 px-0"
                    title="Abrir livro"
                    aria-label="Abrir livro"
                    onClick={() => setAberto(li)}
                  >
                    <BookOpen className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-primario h-8 w-8 px-0"
                    title="Iniciar leitura"
                    aria-label="Iniciar leitura"
                    onClick={() =>
                      navigate({
                        to: "/iniciar",
                        search: { livro: String(li.id) },
                      })
                    }
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline h-8 w-8 px-0"
                    title="Adicionar leitura"
                    aria-label="Adicionar leitura"
                    onClick={() =>
                      navigate({
                        to: "/adicionar",
                        search: { livro: String(li.id) },
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {totalPaginas > 1 ? (
        <div className="mt-6 flex items-center justify-between border-t border-linha px-1 pt-3 text-xs text-tinta-2">
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
      ) : null}

      <footer className="mt-9 border-t border-linha pt-4 text-sm text-tinta-3">
        Nenhum registro precisa ser lembrado — tudo alimenta a estante.{" "}
        <Link
          to="/calendario"
          className="text-fita underline underline-offset-4 hover:text-fita-2"
        >
          ver o calendário do mês
        </Link>
      </footer>

      <Modal
        open={aberto !== null}
        onClose={() => setAberto(null)}
        title={
          <span className="break-words">{aberto?.titulo ?? "Abra um livro"}</span>
        }
      >
        {aberto ? (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-20 shrink-0">
                <CapaLivro titulo={aberto.titulo} imagem={aberto.imagem} pct={null} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed text-tinta-2">
                  {aberto.autor ?? "Livro sem autor registrado"}
                </p>
                <p className="mt-1 text-xs text-tinta-3">
                  Escolha como seguir o caderno deste livro.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                to="/iniciar"
                search={{ livro: String(aberto.id) }}
                className="btn btn-primario h-10 flex-1"
              >
                Começar leitura
              </Link>
              <Link
                to="/adicionar"
                search={{ livro: String(aberto.id) }}
                className="btn btn-outline h-10 flex-1"
              >
                Adicionar leitura manual
              </Link>
            </div>

            <div>
              <p className="eyebrow mb-2">Resumo do livro</p>
              <ResumoLivro md5={aberto.md5} titulo={aberto.titulo} />
            </div>
          </div>
        ) : null}
      </Modal>
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
  const [num2, setNum2] = useState(() => String(sessao.paginaInicial));
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

  const ajustarNum2 = (delta: number): void => {
    setNum2((v) => {
      const n = parseInt(v, 10);
      const base = isNaN(n) ? sessao.paginaInicial : n;
      return String(Math.max(sessao.paginaInicial, base + delta));
    });
    setErros((e) => ({ ...e, "num-2": "" }));
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
      data_hora_1: paraUtc(sessao.inicio),
      data_hora_2: paraUtc(dt2),
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
    <div>
      <header className="mb-7">
        <span className="eyebrow">Leitura em andamento</span>
        <h1 className="titulo-pag break-words">{sessao.titulo}</h1>
        <p className="mt-1 text-sm text-tinta-2">
          Início {fmtLocal(sessao.inicio)} · Página inicial{" "}
          {sessao.paginaInicial}
        </p>
      </header>

      <section className="card mb-6 p-8 text-center">
        <p className="eyebrow">tempo decorrido</p>
        <p className="mt-3 font-mono text-4xl font-bold tabular-nums tracking-tight text-tinta md:text-5xl">
          {fmtTempo(agora - sessao.criadoEm)}
        </p>

        <div className="mt-6 space-y-4 border-t border-linha pt-6 text-left">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-tinta-2">Página inicial</span>
            <span className="font-mono text-base font-semibold text-tinta">
              {sessao.paginaInicial}
            </span>
          </div>
          <div>
            <label htmlFor="pg-final-ativo" className="label">
              Página final
            </label>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="btn btn-outline h-10 shrink-0 px-3"
                title="Diminuir 5 páginas"
                aria-label="Diminuir 5 páginas"
                onClick={() => ajustarNum2(-5)}
              >
                −5
              </button>
              <button
                type="button"
                className="btn btn-outline h-10 shrink-0 px-3"
                title="Diminuir 1 página"
                aria-label="Diminuir 1 página"
                onClick={() => ajustarNum2(-1)}
              >
                −1
              </button>
              <input
                type="number"
                id="pg-final-ativo"
                min={1}
                className="input w-24 shrink-0 text-center"
                value={num2}
                onChange={(e) => setNum2(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline h-10 shrink-0 px-3"
                title="Aumentar 1 página"
                aria-label="Aumentar 1 página"
                onClick={() => ajustarNum2(1)}
              >
                +1
              </button>
              <button
                type="button"
                className="btn btn-outline h-10 shrink-0 px-3"
                title="Aumentar 5 páginas"
                aria-label="Aumentar 5 páginas"
                onClick={() => ajustarNum2(5)}
              >
                +5
              </button>
            </div>
            <p className="mt-1.5 text-center text-xs text-tinta-3">
              já vai preenchida ao finalizar a leitura
            </p>
          </div>
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
          className="btn btn-primario h-11 text-base"
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
          <div className="flex justify-end gap-2 border-t border-linha px-4 py-3">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setFinalizando(false)}
            >
              Cancelar
            </button>
            <button type="button" className="btn btn-primario" onClick={finalizar}>
              Salvar leitura
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-tinta-2">
              Livro:{" "}
              <span className="font-medium text-tinta">{sessao.titulo}</span>
            </p>
            <p className="mt-1 text-xs text-tinta-2">
              Página inicial: {sessao.paginaInicial} · Início:{" "}
              {fmtLocal(sessao.inicio)}
            </p>
          </div>
          <div>
            <label htmlFor="fim-pg" className="label">
              Página finalizada
            </label>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="btn btn-outline h-10 shrink-0 px-3"
                title="Diminuir 5 páginas"
                aria-label="Diminuir 5 páginas"
                onClick={() => ajustarNum2(-5)}
              >
                −5
              </button>
              <button
                type="button"
                className="btn btn-outline h-10 shrink-0 px-3"
                title="Diminuir 1 página"
                aria-label="Diminuir 1 página"
                onClick={() => ajustarNum2(-1)}
              >
                −1
              </button>
              <input
                type="number"
                id="fim-pg"
                min={1}
                className="input w-24 shrink-0 text-center"
                value={num2}
                onChange={(e) => setNum2(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline h-10 shrink-0 px-3"
                title="Aumentar 1 página"
                aria-label="Aumentar 1 página"
                onClick={() => ajustarNum2(1)}
              >
                +1
              </button>
              <button
                type="button"
                className="btn btn-outline h-10 shrink-0 px-3"
                title="Aumentar 5 páginas"
                aria-label="Aumentar 5 páginas"
                onClick={() => ajustarNum2(5)}
              >
                +5
              </button>
            </div>
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