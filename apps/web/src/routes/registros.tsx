import type {
  LeituraRegistro,
  Livro,
  StatsResponse,
} from "@leitura/common";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";

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

const fmtNum = (v: unknown): string => {
  const n = Number(v);
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
};

const iso = (v: string): string => {
  const d = new Date(v);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

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

function SerieTable({
  colunas,
  linhas,
}: {
  colunas: string[];
  linhas: Array<Array<string | number>>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap">
        <thead>
          <tr>
            {colunas.map((c) => (
              <th
                key={c}
                className="border-b border-neutral-200 dark:border-neutral-800 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              {l.map((v, j) => (
                <td
                  key={j}
                  className="border-b border-neutral-200 dark:border-neutral-800 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300"
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

  const mudarFiltro = (patch: Partial<Filtros>): void => {
    setFiltros((f) => ({ ...f, ...patch }));
    setPagina(1);
  };

  const irPagina = (delta: number): void => {
    setPagina((p) => Math.max(1, Math.min(totalPaginas, p + delta)));
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

  const porLivro = (stats?.por_tipo ?? [])
    .filter((t) => typeof t.tipo === "string")
    .map((t) => `${t.tipo}: ${t.n}`)
    .join(" · ");
  const porDia = (stats?.por_dia ?? []).map((d) => [
    d.dia,
    d.n,
    fmtNum(d.horas),
  ]);
  const porMes = (stats?.por_mes ?? []).map((m) => [
    m.mes,
    m.n,
    fmtNum(m.horas),
  ]);

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
            ← Formulário
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
              Exportar CSV
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard valor={String(stats?.total ?? 0)} rotulo="Total" />
        <StatCard
          valor={fmtNum(stats?.duracao_media_horas ?? 0) + " h"}
          rotulo="Duração média"
        />
        <StatCard
          valor={fmtNum(stats?.media_num1 ?? 0)}
          rotulo="Média pág. inicial"
        />
        <StatCard
          valor={fmtNum(stats?.media_num2 ?? 0)}
          rotulo="Média pág. final"
        />
        <StatCard
          valor={fmtNum(stats?.media_num3 ?? 0)}
          rotulo="Média total págs."
        />
        <StatCard
          valor={stats?.primeira_data || "—"}
          rotulo="Primeira"
        />
        <StatCard valor={stats?.ultima_data || "—"} rotulo="Última" />
        <StatCard valor={porLivro || "—"} rotulo="Por livro" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold">Por dia</h3>
          <SerieTable colunas={["Dia", "Qtd", "Horas"]} linhas={porDia} />
        </div>
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold">Por mês</h3>
          <SerieTable colunas={["Mês", "Qtd", "Horas"]} linhas={porMes} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th">ID</th>
              <th className="th">Livro</th>
              <th className="th">Início</th>
              <th className="th">Fim</th>
              <th className="th text-right tab-num">P. ini</th>
              <th className="th text-right tab-num">P. fim</th>
              <th className="th text-right tab-num">Tot.</th>
              <th className="th">KOReader</th>
              <th className="th text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id}>
                <td className="td">{r.id}</td>
                <td className="td">{r.titulo || "—"}</td>
                <td className="td whitespace-nowrap">{fmt(r.data_hora_1)}</td>
                <td className="td whitespace-nowrap">{fmt(r.data_hora_2)}</td>
                <td className="td text-right tab-num">{r.numero_1}</td>
                <td className="td text-right tab-num">{r.numero_2}</td>
                <td className="td text-right tab-num">{r.numero_3}</td>
                <td className="td text-center">
                  {badgeSync(r.leitura_sincronizada)}
                </td>
                <td className="td text-right whitespace-nowrap">
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
        {registros.length === 0 && (
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
          Página {pagina} de {totalPaginas} ({total} registros)
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