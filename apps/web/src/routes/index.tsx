import type { Livro } from "@leitura/common";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { apiBuscarUltimaLeitura, apiGetOpcoes, apiPostLeitura } from "../api";
import { Modal } from "../components/Modal";

export const Route = createFileRoute("/")({ component: FormPage });

const POR_PAGINA = 5;

const pad = (n: number): string => String(n).padStart(2, "0");

const agoraLocal = (): string => {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

const uid = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return (
      "web-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }
};

function FormPage() {
  const [livros, setLivros] = useState<Livro[]>([]);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [livroSelecionado, setLivroSelecionado] = useState<number | null>(null);
  const [dt1, setDt1] = useState(agoraLocal);
  const [dt2, setDt2] = useState(agoraLocal);
  const [num1, setNum1] = useState("1");
  const [num2, setNum2] = useState("1");
  const [num3, setNum3] = useState("1");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [dialogAberto, setDialogAberto] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    apiGetOpcoes()
      .then((data) => setLivros(data.livros ?? []))
      .catch(() => setLivros([]));
  }, []);

  const livroAtivo = livros.find((l) => l.id === livroSelecionado) ?? null;

  const totalPaginas = Math.max(1, Math.ceil(livros.length / POR_PAGINA));
  const paginaClamp = Math.min(paginaAtual, totalPaginas);
  const inicio = (paginaClamp - 1) * POR_PAGINA;
  const fim = Math.min(inicio + POR_PAGINA, livros.length);
  const visiveis = livros.slice(inicio, fim);

  const itemClasse = (li: Livro): string =>
    "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors rounded-md " +
    (livroSelecionado === li.id
      ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
      : "text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800");

  const preencherPaginas = async (livro: Livro): Promise<void> => {
    if (!livro?.md5) return;
    try {
      const data = await apiBuscarUltimaLeitura(livro.md5);
      const ultimo = data.registros?.[0];
      if (!ultimo) return;
      const total = Math.max(1, Number(ultimo.numero_3) || 1);
      const inicioP = Math.min(Math.max(1, Number(ultimo.numero_2) + 1), total);
      setNum1(String(inicioP));
      setNum2(String(inicioP));
      setNum3(String(total));
    } catch {
      return;
    }
  };

  const selecionar = async (id: number): Promise<void> => {
    setLivroSelecionado(id);
    const livro = livros.find((o) => o.id === id);
    if (livro) await preencherPaginas(livro);
  };

  const limparErros = (): void => setErros({});

  const validar = (): boolean => {
    const n1 = parseInt(num1, 10);
    const n2 = parseInt(num2, 10);
    const n3 = parseInt(num3, 10);
    const bag: Record<string, string> = {};
    if (livros.length > 0 && livroSelecionado === null)
      bag["dt1"] = "Selecione um livro";
    if (!dt1) bag["dt1"] = "Obrigatório";
    if (!dt2) bag["dt2"] = "Obrigatório";
    else if (dt1 && dt2 <= dt1) bag["dt2"] = "Deve ser posterior ao início";
    if (isNaN(n1) || n1 < 1) bag["num-1"] = "Deve ser inteiro ≥ 1";
    if (isNaN(n2) || n2 < 1) bag["num-2"] = "Deve ser inteiro ≥ 1";
    else if (!isNaN(n1) && n2 < n1)
      bag["num-2"] = "Deve ser maior ou igual à página inicial";
    if (isNaN(n3) || n3 < 1) bag["num-3"] = "Deve ser inteiro ≥ 1";
    setErros(bag);
    return Object.keys(bag).length === 0;
  };

  const fmtLocal = (v: string): string => {
    const d = new Date(v);
    return (
      d.toLocaleDateString("pt-BR") +
      " " +
      d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    );
  };

  const abrirDialog = (): void => {
    limparErros();
    if (!validar()) return;
    setDialogAberto(true);
  };

  const confirmar = async (): Promise<void> => {
    const payload = {
      op_id: uid(),
      md5: livroAtivo?.md5 ?? "",
      titulo: livroAtivo?.titulo,
      origem: "web" as const,
      data_hora_1: dt1,
      data_hora_2: dt2,
      numero_1: parseInt(num1, 10),
      numero_2: parseInt(num2, 10),
      numero_3: parseInt(num3, 10),
    };
    try {
      const res = await apiPostLeitura(payload);
      setDialogAberto(false);
      if (res.ok) setSucesso(true);
      else alert("Erro: " + res.error);
    } catch (err) {
      setDialogAberto(false);
      alert("Erro de conexão: " + (err instanceof Error ? err.message : err));
    }
  };

  if (sucesso) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
        <div className="card w-full max-w-sm p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
            ✓
          </div>
          <p className="text-base font-semibold">
            Leitura registrada com sucesso!
          </p>
          <Link to="/" className="btn btn-outline mt-4 w-full">
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Leitura Manual</h1>
        <Link
          to="/registros"
          className="text-sm text-neutral-500 dark:text-neutral-400 underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 hover:underline"
        >
          Ver registros →
        </Link>
      </div>

      <section className="card mb-6">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold">Livro</h2>
        </div>
        {livros.length > 0 ? (
          <div className="p-1.5">
            {visiveis.map((li) => (
              <button
                key={li.id}
                type="button"
                onClick={() => selecionar(li.id)}
                className={itemClasse(li)}
              >
                <span>{li.titulo}</span>
                {livroSelecionado === li.id ? (
                  <span aria-hidden="true">✓</span>
                ) : null}
              </button>
            ))}
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
        ) : (
          <div className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">
            Nenhum livro mapeado. Cadastre livros em{" "}
            <Link
              to="/config"
              className="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Configuração
            </Link>
            .
          </div>
        )}
      </section>

      <section className="card mb-6">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold">Período da leitura</h2>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <label htmlFor="dt1" className="label">
              Início da leitura
            </label>
            <input
              type="datetime-local"
              id="dt1"
              className="input"
              value={dt1}
              onChange={(e) => setDt1(e.target.value)}
            />
            <p className="mt-1.5 min-h-[1.2em] text-xs font-medium text-red-600 dark:text-red-400">
              {erros["dt1"] ?? ""}
            </p>
          </div>
          <div>
            <label htmlFor="dt2" className="label">
              Término da leitura
            </label>
            <input
              type="datetime-local"
              id="dt2"
              className="input"
              value={dt2}
              onChange={(e) => setDt2(e.target.value)}
            />
            <p className="mt-1.5 min-h-[1.2em] text-xs font-medium text-red-600 dark:text-red-400">
              {erros["dt2"] ?? ""}
            </p>
          </div>
        </div>
      </section>

      <section className="card mb-6">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold">Páginas</h2>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <label htmlFor="num-1" className="label">
              Página inicial da leitura
            </label>
            <input
              type="number"
              id="num-1"
              min={1}
              value={num1}
              onChange={(e) => setNum1(e.target.value)}
              className="input"
            />
            <p className="mt-1.5 min-h-[1.2em] text-xs font-medium text-red-600 dark:text-red-400">
              {erros["num-1"] ?? ""}
            </p>
          </div>
          <div>
            <label htmlFor="num-2" className="label">
              Página final da leitura
            </label>
            <input
              type="number"
              id="num-2"
              min={1}
              value={num2}
              onChange={(e) => setNum2(e.target.value)}
              className="input"
            />
            <p className="mt-1.5 min-h-[1.2em] text-xs font-medium text-red-600 dark:text-red-400">
              {erros["num-2"] ?? ""}
            </p>
          </div>
          <div>
            <label htmlFor="num-3" className="label">
              Total de páginas do livro físico
            </label>
            <input
              type="number"
              id="num-3"
              min={1}
              value={num3}
              onChange={(e) => setNum3(e.target.value)}
              className="input"
            />
            <p className="mt-1.5 min-h-[1.2em] text-xs font-medium text-red-600 dark:text-red-400">
              {erros["num-3"] ?? ""}
            </p>
          </div>
        </div>
      </section>

      <button
        type="button"
        className="btn btn-primary w-full h-11 text-base"
        onClick={abrirDialog}
      >
        Salvar
      </button>

      <Modal
        open={dialogAberto}
        onClose={() => setDialogAberto(false)}
        title="Confirmar leitura"
        footer={
          <div className="flex justify-end gap-2 border-t border-neutral-200 dark:border-neutral-800 px-4 py-3">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setDialogAberto(false)}
            >
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={confirmar}>
              Confirmar
            </button>
          </div>
        }
      >
        <div className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <strong>Livro:</strong> {livroAtivo?.titulo ?? "—"}
          <br />
          <strong>Início:</strong> {fmtLocal(dt1)}
          <br />
          <strong>Fim:</strong> {fmtLocal(dt2)}
          <br />
          <strong>Página inicial:</strong> {num1}
          <br />
          <strong>Página final:</strong> {num2}
          <br />
          <strong>Total de páginas:</strong> {num3}
        </div>
      </Modal>
    </div>
  );
}