import type {
  LeituraExportRow,
  LeituraInsert,
  LeituraRegistro,
  LeituraRow,
  Livro,
  LivroPersist,
  StatsResponse,
} from "@leitura/common";

import type { FiltrosLeitura } from "./filtros";

export interface ListaQuery extends FiltrosLeitura {
  page?: string | null;
  limit?: string | null;
  sort?: string | null;
  dir?: string | null;
}

export interface LivroEncontrado {
  id: number;
  titulo: string;
  autor: string;
  imagem: string;
  md5: string | null;
  oculto: boolean;
}

// Contrato único de persistência. Cada dialeto (SQLite/Postgres) implementa
// esta interface; services e rotas só conhecem `Repo`, nunca um driver.
export interface Repo {
  ping(): Promise<void>;

  // opcao / livros
  buscarLivroMd5(md5: string): Promise<LivroEncontrado | undefined>;
  maxPosicaoLivro(): Promise<number>;
  inserirLivro(v: {
    titulo: string;
    autor?: string;
    imagem?: string;
    md5: string;
    posicao?: number;
    oculto?: boolean;
  }): Promise<number>;
  atualizarLivroMd5(
    md5: string,
    v: { titulo: string; autor: string; imagem: string },
  ): Promise<void>;
  listarLivros(): Promise<Livro[]>;
  substituirLivros(livros: LivroPersist[] | undefined): Promise<void>;

  // leitura
  contarLeitura(q: ListaQuery): Promise<number>;
  listarRegistros(
    q: ListaQuery,
    limit: number,
    offset: number,
  ): Promise<LeituraRegistro[]>;
  exportarRegistros(q: FiltrosLeitura): Promise<LeituraExportRow[]>;
  excluirLeitura(id: number): Promise<number>;
  buscarLeituraIdPorOpId(opId: string): Promise<number | undefined>;
  buscarLeituraPorId(id: number): Promise<LeituraRow | undefined>;
  inserirLeitura(v: LeituraInsert): Promise<number>;
  atualizarLeitura(id: number, patch: Partial<LeituraInsert>): Promise<void>;

  // estatísticas agregadas (opcionalmente recortadas por data/outros filtros)
  stats(filtros?: FiltrosLeitura): Promise<StatsResponse>;
}
