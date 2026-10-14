import { useCallback, useEffect, useRef, useState } from "react";

// D.2: estado padrão para chamadas GET assíncronas (carregando/erro/retry).
export interface UseApiResult<T> {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
}

export const useApi = <T>(
  fn: () => Promise<T>,
  deps: readonly unknown[] = [],
): UseApiResult<T> => {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [vez, setVez] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    fnRef.current()
      .then((d) => {
        if (ativo) setDados(d);
      })
      .catch((e: unknown) => {
        if (ativo) setErro(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, vez]);

  const recarregar = useCallback(() => setVez((v) => v + 1), []);

  return { dados, carregando, erro, recarregar };
};