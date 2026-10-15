import type { LeituraRegistro, Livro } from "@leitura/common";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  apiDeleteLeitura,
  apiGetOpcoes,
  apiListaLeitura,
  apiPatchLeitura,
} from "../api";
import { BannerErro } from "../components/BannerErro";
import { DetalhesSessao } from "../components/DetalhesSessao";
import { Modal } from "../components/Modal";
import { useApi } from "../hooks/useApi";
import {
  fmtDuracao,
  fmtInt,
  fmtLocal as fmt,
  isoLocal as iso,
  minutosEntre,
  paraUtc,
} from "../lib/format";

export const Route = createFileRoute("/registros")({ component: RegistrosPage });

const POR_PAGINA = 10;

const badgeSync = (s: number | null | undefined): ReactNode => {
  if (s === 1)
    return (
      <span className="badge bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
        ✓ Sincronizado
      </span>
    );
  if (s === 2)
    return <span className="badge bg-papel-3 text-tinta-3">Pulada</span>;
  return (
    <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
      Em espera
    </span>
  );
};

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
      aria-sort={ativa ? (ordem.dir === 1 ? "ascending" : "descending") : "none"}
      className={
        "cursor-pointer select-none border-b border-linha px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-tinta-3 transition-colors hover:text-tinta " +
        (direita ? "text-right" : "text-left")
      }
      onClick={() => aoOrdenar(chave)}
      title={"Ordenar por " + rotulo}
    >
      {rotulo}
      <span className="ml-1 text-[10px]">
        {ativa ? (ordem.dir === 1 ? "▲" : "▼") : ""}
      </span>
    </th>
  );
}

function AcoesRegistro({
  r,
  aoEditar,
  aoExcluir,
  aoEspera,
}: {
  r: LeituraRegistro;
  aoEditar: (r: LeituraRegistro) => void;
  aoExcluir: (id: number) => void;
  aoEspera: (id: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {r.leitura_sincronizada === 1 ? (
        <button
          type="button"
          className="btn-icone"
          title="Voltar para Em espera"
          aria-label="Voltar para Em espera"
          onClick={() => aoEspera(r.id)}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      ) : null}
      <button
        type="button"
        className="btn-icone"
        title="Editar registro"
        aria-label="Editar registro"
        onClick={() => aoEditar(r)}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="btn-icone"
        title="Excluir registro"
        aria-label="Excluir registro"
        onClick={() => aoExcluir(r.id)}
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <DetalhesSessao registro={r} />
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
  const [editando, setEditando] = useState<LeituraRegistro | null>(null);
  const [ordem, setOrdem] = useState<Ordem>({ chave: "id", dir: -1 });

  const queryFiltros = (incluirPagina: boolean): URLSearchParams => {
    const params: Record<string, string> = {};
    if (incluirPagina) {
      params.limit = String(POR_PAGINA);
      params.page = String(pagina);
      params.sort = ordem.chave;
      params.dir = ordem.dir === 1 ? "asc" : "desc";
    }
    if (filtros.livro) params.md5 = filtros.livro;
    if (filtros.sync !== "") params.sincronizada = filtros.sync;
    if (filtros.inicio) params.data_inicio = paraUtc(filtros.inicio + "T00:00");
    if (filtros.fim) params.data_fim = paraUtc(filtros.fim + "T23:59:00");
    return new URLSearchParams(params);
  };

  const carrega = useCallback(async () => {
    const data = await apiListaLeitura(queryFiltros(true));
    return { registros: data.registros ?? [], total: data.total };
  }, [filtros, pagina, ordem]);

  const lista = useApi(carrega, [carrega]);
  const opcoesLivros = useApi(apiGetOpcoes);
  const { recarregar } = lista;

  useEffect(() => {
    if (opcoesLivros.dados) setLivros(opcoesLivros.dados.livros ?? []);
  }, [opcoesLivros.dados]);

  const registros = lista.dados?.registros ?? [];
  const total = lista.dados?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

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
      data_hora_1: paraUtc(val("edit-dt1")),
      data_hora_2: paraUtc(val("edit-dt2")),
      numero_1: parseInt(val("edit-num-1"), 10),
      numero_2: parseInt(val("edit-num-2"), 10),
      numero_3: parseInt(val("edit-num-3"), 10),
    });
    fecharEditar();
    if (res.ok) recarregar();
    else alert("Erro: " + res.error);
  };

  const excluir = async (id: number): Promise<void> => {
    if (!confirm("Excluir registro " + id + "?")) return;
    const data = await apiDeleteLeitura(id);
    if (data.ok) recarregar();
    else alert("Erro: " + data.error);
  };

  const marcarEmEspera = async (id: number): Promise<void> => {
    const data = await apiPatchLeitura(id, { leitura_sincronizada: 0 });
    if (data.ok) recarregar();
    else alert("Erro: " + data.error);
  };

  const filtrosAtivos =
    filtros.livro !== "" ||
    filtros.sync !== "" ||
    filtros.inicio !== "" ||
    filtros.fim !== "";

  return (
    <div>
      <header className="mb-7">
        <span className="eyebrow">Registros</span>
        <h1 className="titulo-pag">Histórico de leitura</h1>
        <p className="mt-1 text-sm text-tinta-2">
          Tabela completa, filtrável e exportável.
        </p>
      </header>

      {lista.carregando ? (
        <div className="card mb-6 p-8 text-center text-sm text-tinta-2">
          Carregando…
        </div>
      ) : null}
      {lista.erro ? <BannerErro texto={lista.erro} aoTentar={recarregar} /> : null}

      <div className="card mb-6 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-linha pt-4">
          <p className="text-sm text-tinta-3">
            {filtrosAtivos
              ? "Filtros aplicados — os registros abaixo já refletem a seleção."
              : "Sem filtros — mostrando todos os registros."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primario"
              onClick={() => setPagina(1)}
            >
              Filtrar
            </button>
            <button type="button" className="btn btn-outline" onClick={exportarCsv}>
              CSV
            </button>
            {filtrosAtivos ? (
              <button
                type="button"
                className="btn btn-suave"
                onClick={limparFiltros}
              >
                Limpar
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr>
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
                rotulo="Duração"
                chave="duracao"
                ordem={ordem}
                aoOrdenar={ordenar}
                direita
              />
              <th className="th">Status</th>
              <th className="th text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-papel">
                <td className="td max-w-[16rem] truncate">{r.titulo || "—"}</td>
                <td className="td whitespace-nowrap">{fmt(r.data_hora_1)}</td>
                <td className="td whitespace-nowrap text-right tabular-nums">
                  {fmtDuracao(minutosEntre(r.data_hora_1, r.data_hora_2))}
                </td>
                <td className="td whitespace-nowrap">
                  {badgeSync(r.leitura_sincronizada)}
                </td>
                <td className="td whitespace-nowrap">
                  <AcoesRegistro
                    r={r}
                    aoEditar={setEditando}
                    aoExcluir={excluir}
                    aoEspera={marcarEmEspera}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {registros.length === 0 && (
          <div className="px-4 py-10 text-center text-sm font-medium text-tinta-2">
            Nenhum registro encontrado.
          </div>
        )}
      </div>

      <div className="md:hidden">
        {registros.length === 0 ? (
          <div className="card px-4 py-10 text-center text-sm font-medium text-tinta-2">
            Nenhum registro encontrado.
          </div>
        ) : (
          <ul className="space-y-3">
            {registros.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-tinta">
                      {r.titulo || "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-tinta-3">
                      {fmt(r.data_hora_1)}
                    </p>
                  </div>
                  <span className="shrink-0">
                    {badgeSync(r.leitura_sincronizada)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-linha pt-3">
                  <span className="font-mono text-xs text-tinta-2">
                    {fmtDuracao(minutosEntre(r.data_hora_1, r.data_hora_2))}
                  </span>
                  <AcoesRegistro
                    r={r}
                    aoEditar={setEditando}
                    aoExcluir={excluir}
                    aoEspera={marcarEmEspera}
                  />
                </div>
              </li>
            ))}
          </ul>
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
        <span className="text-sm text-tinta-2">
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
          <div className="flex justify-end gap-2 border-t border-linha px-4 py-3">
            <button type="button" className="btn btn-outline" onClick={fecharEditar}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primario" onClick={salvarEdicao}>
              Salvar
            </button>
          </div>
        }
      >
        {editando && (
          <div key={editando.id}>
            <label className="label mt-3">Livro</label>
            <select
              id="edit-md5"
              className="select w-full"
              defaultValue={editando.md5 ?? ""}
            >
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