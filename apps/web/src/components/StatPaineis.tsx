export function StatCard({
  valor,
  rotulo,
}: {
  valor: string;
  rotulo: string;
}) {
  return (
    <div className="card p-4">
      <div className="font-mono text-xl font-semibold tabular-nums tracking-tight text-tinta">
        {valor}
      </div>
      <div className="mt-1 text-xs text-tinta-3">{rotulo}</div>
    </div>
  );
}

export interface SerieItem {
  rotulo: string;
  valor: number;
  extra: string;
}

export function SerieComBarras({ itens }: { itens: SerieItem[] }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  if (itens.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-tinta-2">
        Sem dados para o recorte atual.
      </div>
    );
  }
  return (
    <div className="space-y-3 p-4">
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-medium text-tinta">{i.rotulo}</span>
            <span className="shrink-0 text-tinta-2">{i.extra}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-papel-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-fita-2 to-fita"
              style={{ width: `${Math.max(2, (i.valor / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}