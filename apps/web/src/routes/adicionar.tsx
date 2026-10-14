import type { Livro } from "@leitura/common";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { apiBuscarUltimaLeitura, apiGetOpcoes, apiPostLeitura } from "../api";
import { BannerErro } from "../components/BannerErro";
import { Modal } from "../components/Modal";
import { useApi } from "../hooks/useApi";
import { agoraLocal, fmtLocal, paraUtc, uid } from "../util";

export const Route = createFileRoute("/adicionar")({
  component: AdicionarPage,
  validateSearch: (search: Record<string, unknown>) => ({
    livro: typeof search.livro === "string" ? search.livro : undefined,
  }),
});

function AdicionarPage() {
  const { livro } = Route.useSearch();
  const [livroAtivo, setLivroAtivo] = useState<Livro | null>(null);
  const [livrosCarregados, setLivrosCarregados] = useState(false);
  const [dt1, setDt1] = useState(agoraLocal);
  const [dt2, setDt2] = useState(agoraLocal);
  const [num1, setNum1] = useState("1");
  const [num2, setNum2] = useState("1");
  const [num3, setNum3] = useState("1");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [dialogAberto, setDialogAberto] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const opcoes = useApi(apiGetOpcoes, [livro]);

  useEffect(() => {
    const alvo =
      (opcoes.dados?.livros ?? []).find((l) => l.id === Number(livro)) ?? null;
    setLivroAtivo(alvo);
    setLivrosCarregados(true);
    if (alvo?.md5) preencherPaginas(alvo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opcoes.dados, livro]);

  const preencherPaginas = async (livroSelecionado: Livro): Promise<void> => {
    if (!livroSelecionado?.md5) return;
    try {
      const data = await apiBuscarUltimaLeitura(livroSelecionado.md5);
      const ultimo = data.registros?.[0];
      if (!ultimo) return;
      const total = Math.max(1, Number(ultimo.numero_3) || 1);
      const inicioP = Math.min(Math.max(1, Number(ultimo.numero_2)), total);
      setNum1(String(inicioP));
      setNum2(String(inicioP));
      setNum3(String(total));
    } catch {
      return;
    }
  };

  const limparErros = (): void => setErros({});

  const validar = (): boolean => {
    const n1 = parseInt(num1, 10);
    const n2 = parseInt(num2, 10);
    const n3 = parseInt(num3, 10);
    const bag: Record<string, string> = {};
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
      data_hora_1: paraUtc(dt1),
      data_hora_2: paraUtc(dt2),
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
      <div className="flex h-full items-center justify-center">
        <div className="card mx-auto w-full max-w-sm p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
            ✓
          </div>
          <p className="text-base font-semibold text-tinta">
            Leitura registrada com sucesso!
          </p>
          <Link to="/" className="btn btn-outline mt-4 w-full">
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  if (opcoes.erro) {
    return <BannerErro texto={opcoes.erro} aoTentar={opcoes.recarregar} />;
  }

  if (livrosCarregados && !livroAtivo) {
    return (
      <div className="card p-6 text-sm text-tinta-2">
        Livro não encontrado.{" "}
        <Link to="/" className="text-fita underline underline-offset-4">
          Voltar para a estante
        </Link>
        .
      </div>
    );
  }

  return (
    <div>
      <header className="mb-7">
        <span className="eyebrow">Adicionar leitura</span>
        <h1 className="titulo-pag">Uma noite de leitura</h1>
      </header>

      {livrosCarregados && livroAtivo ? (
        <section className="card mb-6">
          <div className="border-b border-linha px-5 py-3">
            <h2 className="text-sm font-semibold text-tinta">Livro</h2>
          </div>
          <div className="px-5 py-3 text-sm text-tinta">{livroAtivo.titulo}</div>
        </section>
      ) : null}

      <section className="card mb-6">
        <div className="border-b border-linha px-5 py-3">
          <h2 className="text-sm font-semibold text-tinta">Período da leitura</h2>
        </div>
        <div className="space-y-4 p-5">
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
        <div className="border-b border-linha px-5 py-3">
          <h2 className="text-sm font-semibold text-tinta">Páginas</h2>
        </div>
        <div className="space-y-4 p-5">
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
        className="btn btn-primario h-11 w-full text-base"
        onClick={abrirDialog}
        disabled={!livroAtivo}
      >
        Salvar
      </button>

      <Modal
        open={dialogAberto}
        onClose={() => setDialogAberto(false)}
        title="Confirmar leitura"
        footer={
          <div className="flex justify-end gap-2 border-t border-linha px-4 py-3">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setDialogAberto(false)}
            >
              Cancelar
            </button>
            <button type="button" className="btn btn-primario" onClick={confirmar}>
              Confirmar
            </button>
          </div>
        }
      >
        <div className="text-sm leading-relaxed text-tinta-2">
          <strong className="text-tinta">Livro:</strong> {livroAtivo?.titulo ?? "—"}
          <br />
          <strong className="text-tinta">Início:</strong> {fmtLocal(dt1)}
          <br />
          <strong className="text-tinta">Fim:</strong> {fmtLocal(dt2)}
          <br />
          <strong className="text-tinta">Página inicial:</strong> {num1}
          <br />
          <strong className="text-tinta">Página final:</strong> {num2}
          <br />
          <strong className="text-tinta">Total de páginas:</strong> {num3}
        </div>
      </Modal>
    </div>
  );
}