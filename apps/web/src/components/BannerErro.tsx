// Falha de carregamento com opção de tentar novamente (usado junto do useApi).
export function BannerErro({
  texto,
  aoTentar,
}: {
  texto: string;
  aoTentar: () => void;
}) {
  return (
    <div className="card mb-6 border-red-300 bg-red-50 p-4 text-center text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
      <p>Não foi possível carregar os dados: {texto}</p>
      <button type="button" className="btn btn-outline mt-3" onClick={aoTentar}>
        Tentar de novo
      </button>
    </div>
  );
}