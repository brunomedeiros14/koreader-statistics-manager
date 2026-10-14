import { Component, type ErrorInfo, type ReactNode } from "react";

// D.7: captura erros de renderização não tratados em qualquer página.
interface Props {
  children: ReactNode;
}

interface State {
  erro: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo): void {
    console.error("Erro não capturado:", erro, info);
  }

  limpar = (): void => this.setState({ erro: null });

  render(): ReactNode {
    if (this.state.erro) {
      return (
        <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center bg-desk px-4">
          <div className="w-full rounded-xl border border-linha bg-papel p-6 text-center shadow-[0_14px_40px_rgb(60_49_33/0.12)]">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              !
            </div>
            <h1 className="text-base font-semibold text-tinta">
              Algo deu errado
            </h1>
            <p className="mt-2 text-sm text-tinta-2">
              {this.state.erro.message}
            </p>
            <button type="button" className="btn btn-primario mt-4" onClick={this.limpar}>
              Tentar de novo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}