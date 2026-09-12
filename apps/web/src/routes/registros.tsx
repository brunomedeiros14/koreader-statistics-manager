import type {
  LeituraRegistro,
  Livro,
  StatsResponse,
} from "@leitura/common";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  apiDeleteLeitura,
  apiGetOpcoes,
  apiListaLeitura,
  apiPatchLeitura,
  apiStats,
} from "../api";
import { Modal } from "../components/Modal";

export const Route = createFileRoute("/registros")({ component: RegistrosPage });

const POR_PAGINA = 10;

const pad = (n: number): string => String(n).padStart(2, "0");

const fmt = (v: string): string => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return (
    d.toLocaleDateString("pt-BR") +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
};

const iso = (v: string): string => {
  const d = new Date(v);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

const fmtDuracao = (min: number): string => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}min`;
  if (r === 0) return `${h}h`;
  return `${h}h${String(r).padStart(2, "0")}min`;
};

const fmtDec = (n: number): string =>
  n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtInt = (n: number): string => n.toLocaleString("pt-BR");

const minutosEntre = (a: string, b: string): number =>
  Math.max(
    0,
    Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000),
  );

const paginasLidas = (r: LeituraRegistro): number | null =>
  r.numero_2 >= r.numero_1 ? r.numero_2 - r.numero_1 + 1 : null;

const badgeSync = (s: number | null | undefined): ReactNode => {
  if (s === 1)
    return (
      <span className="badge bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
        ✓ Sincronizado
      </span>
    );
  if (s === 2)
    return (
      <span className="badge bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
        Pulada
      </span>
    );
  return (
    <span className="badge bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
      Em espera
    </span>
  );
};

function StatCard({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-semibold tracking-tight">{valor}</div>
      <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {rotulo}
      </div>
    </div>
  );
}

interface SerieItem {
  rotulo: string;
  valor: number;
  extra: string;
}

function SerieComBarras({ itens }: { itens: SerieItem[] }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  if (itens.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Sem dados para o recorte atual.
      </div>
    );
  }
  return (
    <div className="space-y-3 p-4">
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-medium text-neutral-600 dark:text-neutral-300">
              {i.rotulo}
            </span>
            <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
              {i.extra}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-neutral-800 dark:bg-neutral-200"
              style={{ width: `${Math.max(2, (i.valor / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

type SortKey =
  | "id"
  | "titulo"
  | "data_hora_1"
  | "data_hora_2"
  | "duracao"
  | "numero_1"
  | "numero_2"
  | "numero_3";

type Ordem = { chave: SortKey; dir: 1 | -1 };

const comparar = (a: LeituraRegistro, b: LeituraRegistro, chave: SortKey): number => {
  switch (chave) {
    case "id":
      return a.id - b.id;
    case "titulo":
      return (a.titulo ?? "").localeCompare(b.titulo ?? "", "pt-BR");
    case "data_hora_1":
      return a.data_hora_1.localeCompare(b.data_hora_1);
    case "data_hora_2":
      return a.data_hora_2.localeCompare(b.data_hora_2);
    case "duracao":
      return (
        minutosEntre(a.data_hora_1, a.data_hora_2) -
        minutosEntre(b.data_hora_1, b.data_hora_2)
      );
    case "numero_1":
      return a.numero_1 - b.numero_1;
    case "numero_2":
      return a.numero_2 - b.numero_2;
    case "numero_3":
      return a.numero_3 - b.numero_3;
  }
};

function ThOrdenavel({
  rotulo,
  chave,
  ordem,
  aoOrdenar,
  direita,
}: {
  rotulo: string;
  chave: SortKey;
  ordem: Ordem;
  aoOrdenar: (chave: SortKey) => void;
  direita?: boolean;
}) {
  const ativa = ordem.chave === chave;
  return (
    <th
      aria-sort={
        ativa ? (ordem.dir === 1 ? "ascending" : "descending") : "none"
      }
      className={
        "border-b border-neutral-200 dark:border-neutral-800 px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400 cursor-pointer select-none transition-colors hover:text-neutral-900 dark:hover:text-neutral-100 " +
        (direita ? "text-right" : "text-left")
      }
      onClick={() => aoOrdenar(chave)}
      title={"Ordenar por " + rotulo}
    >
      {rotulo}
      <span className="ml-1 text-[10px]">{ativa ? (ordem.dir === 1 ? "▲" : "▼") : ""}</span>
    </th>
  );
}

interface Filtros {
  livro: string;
  sync: string;
  inicio: string;
  fim: string;
}

function RegistrosPage() {
  const [livros, setLivros] = useState<Livro[]>([]);
  const [filtros, setFiltros] = useState<Filtros>({
    livro: "",
    sync: "",
    inicio: "",
    fim: "",
  });
  const [pagina, setPagina] = useState(1);
  const [registros, setRegistros] = useState<LeituraRegistro[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [editando, setEditando] = useState<LeituraRegistro | null>(null);
  const [ordem, setOrdem] = useState<Ordem>({ chave: "id", dir: -1 });

  const queryFiltros = (incluirPagina: boolean): URLSearchParams => {
    const params: Record<string, string> = {};
    if (incluirPagina) {
      params.limit = String(POR_PAGINA);
      params.page = String(pagina);
    }
    if (filtros.livro) params.md5 = filtros.livro;
    if (filtros.sync !== "") params.sincronizada = filtros.sync;
    if (filtros.inicio) params.data_inicio = filtros.inicio + "T00:00";
    if (filtros.fim) params.data_fim = filtros.fim + "T23:59";
    return new URLSearchParams(params);
  };

  const carregar = useCallback(async (): Promise<void> => {
    const data = await apiListaLeitura(queryFiltros(true));
    setRegistros(data.registros ?? []);
    setTotal(data.total);
    setTotalPaginas(Math.max(1, Math.ceil(data.total / POR_PAGINA)));
    setStats(await apiStats());
  }, [filtros, pagina]);

  useEffect(() => {
    apiGetOpcoes()
      .then((data) => setLivros(data.livros ?? []))
      .catch(() => setLivros([]));
  }, []);

  useEffect(() => {
    carregar().catch(() => setRegistros([]));
  }, [carregar]);

  const registrosOrdenados = useMemo(() => {
    const arr = [...registros];
    arr.sort((a, b) => ordem.dir * comparar(a, b, ordem.chave));
    return arr;
  }, [registros, ordem]);

  const mudarFiltro = (patch: Partial<Filtros>): void => {
    setFiltros((f) => ({ ...f, ...patch }));
    setPagina(1);
  };

  const limparFiltros = (): void => {
    setFiltros({ livro: "", sync: "", inicio: "", fim: "" });
    setPagina(1);
  };

  const irPagina = (delta: number): void => {
    setPagina((p) => Math.max(1, Math.min(totalPaginas, p + delta)));
  };

  const ordenar = (chave: SortKey): void => {
    setOrdem((o) =>
      o.chave === chave
        ? { chave, dir: o.dir === 1 ? -1 : 1 }
        : { chave, dir: chave === "titulo" ? 1 : -1 },
    );
  };

  const exportarCsv = (): void => {
    const params = queryFiltros(false);
    window.location.href = "/api/export.csv?" + params.toString();
  };

  const fecharEditar = (): void => setEditando(null);

  const salvarEdicao = async (): Promise<void> => {
    if (!editando) return;
    const md5 = (
      document.getElementById("edit-md5") as HTMLSelectElement | null
    )?.value;
    const livroObj = livros.find((li) => li.md5 === md5);
    const val = (id: string): string =>
      (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
    const res = await apiPatchLeitura(editando.id, {
      md5,
      titulo: livroObj ? livroObj.titulo : undefined,
      data_hora_1: val("edit-dt1"),
      data_hora_2: val("edit-dt2"),
      numero_1: parseInt(val("edit-num-1"), 10),
      numero_2: parseInt(val("edit-num-2"), 10),
      numero_3: parseInt(val("edit-num-3"), 10),
    });
    fecharEditar();
    if (res.ok) await carregar();
    else alert("Erro: " + res.error);
  };

  const excluir = async (id: number): Promise<void> => {
    if (!confirm("Excluir registro " + id + "?")) return;
    const data = await apiDeleteLeitura(id);
    if (data.ok) await carregar();
    else alert("Erro: " + data.error);
  };

  const porLivro: SerieItem[] = (stats?.por_tipo ?? [])
    .filter((t) => typeof t.tipo === "string" && t.tipo)
    .map((t) => ({
      rotulo: t.tipo as string,
      valor: t.n,
      extra: fmtDuracao(t.horas * 60) + " · " + t.n + " leitura" + (t.n === 1 ? "" : "s"),
    }));

  const porDia: SerieItem[] = (stats?.por_dia ?? []).map((d) => ({
    rotulo: d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7) + "/" + d.dia.slice(0, 4),
    valor: d.n,
    extra: d.n + " · " + fmtDuracao(d.horas * 60),
  }));

  const porMes: SerieItem[] = (stats?.por_mes ?? []).map((m) => ({
    rotulo: m.mes,
    valor: m.n,
    extra: m.n + " · " + fmtDuracao(m.horas * 60),
  }));

  const filtrosAtivos =
    filtros.livro !== "" || filtros.sync !== "" || filtros.inicio !== "" || filtros.fim !== "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Registros de leitura
        </h1>
        <div className="flex items-center gap-4 text-sm">
          <Link
            to="/config"
            className="text-neutral-500 dark:text-neutral-400 underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 hover:underline"
          >
            Configurar
          </Link>
          <Link
            to="/"
            className="text-neutral-500 dark:text-neutral-400 underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 hover:underline"
          >
            ← Estante
          </Link>
        </div>
      </div>

      <div className="card mb-6 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="f-livro" className="label">
              Livro
            </label>
            <select
              id="f-livro"
              className="select w-full"
              value={filtros.livro}
              onChange={(e) => mudarFiltro({ livro: e.target.value })}
            >
              <option value="">Todos</option>
              {livros.map((li) => (
                <option key={li.id} value={li.md5 ?? ""}>
                  {li.titulo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-sync" className="label">
              KOReader
            </label>
            <select
              id="f-sync"
              className="select w-full"
              value={filtros.sync}
              onChange={(e) => mudarFiltro({ sync: e.target.value })}
            >
              <option value="">Todos</option>
              <option value="0">Em espera</option>
              <option value="1">Sincronizado</option>
              <option value="2">Pulada</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-inicio" className="label">
              A partir de
            </label>
            <input
              type="date"
              id="f-inicio"
              className="input"
              value={filtros.inicio}
              onChange={(e) => mudarFiltro({ inicio: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="f-fim" className="label">
              Até
            </label>
            <input
              type="date"
              id="f-fim"
              className="input"
              value={filtros.fim}
              onChange={(e) => mudarFiltro({ fim: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setPagina(1);
                carregar();
              }}
            >
              Filtrar
            </button>
            <button type="button" className="btn btn-outline" onClick={exportarCsv}>
              CSV
            </button>
            {filtrosAtivos ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={limparFiltros}
              >
                Limpar
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          valor={fmtInt(stats?.total ?? 0)}
          rotulo="Total de leituras"
        />
        <StatCard
          valor={fmtDuracao((stats?.duracao_total_horas ?? 0) * 60)}
          rotulo="Tempo total"
        />
        <StatCard
          valor={fmtDuracao((stats?.duracao_media_horas ?? 0) * 60)}
          rotulo="Duração média"
        />
        <StatCard
          valor={fmtInt(stats?.paginas_lidas ?? 0)}
          rotulo="Páginas lidas"
        />
        <StatCard
          valor={fmtDec(stats?.media_num1 ?? 0)}
          rotulo="Média pág. inicial"
        />
        <StatCard
          valor={fmtDec(stats?.media_num2 ?? 0)}
          rotulo="Média pág. final"
        />
        <StatCard valor={stats?.primeira_data ? fmt(stats.primeira_data) : "—"} rotulo="Primeira" />
        <StatCard valor={stats?.ultima_data ? fmt(stats.ultima_data) : "—"} rotulo="Última" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card">
          <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
            <h3 className="text-sm font-semibold">Por livro</h3>
          </div>
          <SerieComBarras itens={porLivro} />
        </div>
        <div className="card">
          <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
            <h3 className="text-sm font-semibold">Por dia</h3>
          </div>
          <SerieComBarras itens={porDia} />
        </div>
        <div className="card">
          <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
            <h3 className="text-sm font-semibold">Por mês</h3>
          </div>
          <SerieComBarras itens={porMes} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <ThOrdenavel
                rotulo="ID"
                chave="id"
                ordem={ordem}
                aoOrdenar={ordenar}
              />
              <ThOrdenavel
                rotulo="Livro"
                chave="titulo"
                ordem={ordem}
                aoOrdenar={ordenar}
              />
              <ThOrdenavel
                rotulo="Início"
                chave="data_hora_1"
                ordem={ordem}
                aoOrdenar={ordenar}
              />
              <ThOrdenavel
                rotulo="Fim"
                chave="data_hora_2"
                ordem={ordem}
                aoOrdenar={ordenar}
              />
              <ThOrdenavel
                rotulo="Dur."
                chave="duracao"
                ordem={ordem}
                aoOrdenar={ordenar}
                direita
              />
              <ThOrdenavel
                rotulo="P. ini"
                chave="numero_1"
                ordem={ordem}
                aoOrdenar={ordenar}
                direita
              />
              <ThOrdenavel
                rotulo="P. fim"
                chave="numero_2"
                ordem={ordem}
                aoOrdenar={ordenar}
                direita
              />
              <ThOrdenavel
                rotulo="Tot."
                chave="numero_3"
                ordem={ordem}
                aoOrdenar={ordenar}
                direita
              />
              <th className="th text-right">Págs.</th>
              <th className="th">KOReader</th>
              <th className="th text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {registrosOrdenados.map((r) => (
              <tr
                key={r.id}
                className="transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
              >
                <td className="td">{r.id}</td>
                <td className="td max-w-[14rem] truncate">{r.titulo || "—"}</td>
                <td className="td whitespace-nowrap">{fmt(r.data_hora_1)}</td>
                <td className="td whitespace-nowrap">{fmt(r.data_hora_2)}</td>
                <td className="td whitespace-nowrap text-right tabular-nums">
                  {fmtDuracao(minutosEntre(r.data_hora_1, r.data_hora_2))}
                </td>
                <td className="td text-right tabular-nums">{r.numero_1}</td>
                <td className="td text-right tabular-nums">{r.numero_2}</td>
                <td className="td text-right tabular-nums">{r.numero_3}</td>
                <td className="td text-right tabular-nums">
                  {paginasLidas(r) ?? "—"}
                </td>
                <td className="td whitespace-nowrap text-center">
                  {badgeSync(r.leitura_sincronizada)}
                </td>
                <td className="td whitespace-nowrap text-right">
                  <button
                    type="button"
                    className="btn btn-outline h-8 px-2.5 mr-1"
                    onClick={() => setEditando(r)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline h-8 px-2.5"
                    onClick={() => excluir(r.id)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {registrosOrdenados.length === 0 && (
          <div className="px-4 py-10 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Nenhum registro encontrado.
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          className="btn btn-outline h-8 px-3"
          disabled={pagina <= 1}
          onClick={() => irPagina(-1)}
        >
          ‹ Anterior
        </button>
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          Página {pagina} de {totalPaginas} ({fmtInt(total)} registros)
        </span>
        <button
          type="button"
          className="btn btn-outline h-8 px-3"
          disabled={pagina >= totalPaginas}
          onClick={() => irPagina(1)}
        >
          Próxima ›
        </button>
      </div>

      <Modal
        open={editando !== null}
        onClose={fecharEditar}
        title={<span>Editar registro #{editando?.id ?? ""}</span>}
        footer={
          <div className="flex justify-end gap-2 border-t border-neutral-200 dark:border-neutral-800 px-4 py-3">
            <button type="button" className="btn btn-outline" onClick={fecharEditar}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={salvarEdicao}>
              Salvar
            </button>
          </div>
        }
      >
        {editando && (
          <div key={editando.id}>
            <label className="label mt-3">Livro</label>
            <select id="edit-md5" className="select w-full" defaultValue={editando.md5 ?? ""}>
              {livros.map((li) => (
                <option key={li.id} value={li.md5 ?? ""}>
                  {li.titulo}
                </option>
              ))}
            </select>
            <label className="label mt-3">Início da leitura</label>
            <input
              type="datetime-local"
              id="edit-dt1"
              className="input"
              defaultValue={iso(editando.data_hora_1)}
            />
            <label className="label mt-3">Término da leitura</label>
            <input
              type="datetime-local"
              id="edit-dt2"
              className="input"
              defaultValue={iso(editando.data_hora_2)}
            />
            <label className="label mt-3">Página inicial da leitura</label>
            <input
              type="number"
              id="edit-num-1"
              min={1}
              className="input"
              defaultValue={editando.numero_1 ?? 1}
            />
            <label className="label mt-3">Página final da leitura</label>
            <input
              type="number"
              id="edit-num-2"
              min={1}
              className="input"
              defaultValue={editando.numero_2 ?? 1}
            />
            <label className="label mt-3">Total de páginas do livro físico</label>
            <input
              type="number"
              id="edit-num-3"
              min={1}
              className="input"
              defaultValue={editando.numero_3 ?? 1}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}