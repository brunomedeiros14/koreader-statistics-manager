import { Type, type Static } from "@sinclair/typebox";

// Contractos de API (Elysia usa TypeBox por baixo) — fonte única para os
// schemas das rotas e seus tipos (K.1).
//
// Mantidos alinhados com as interfaces em ./domain.ts; migração completa das
// interfaces para Type.Static fica listada como G.4.

export const leituraBodySchema = Type.Object({
  op_id: Type.Optional(Type.String()),
  md5: Type.String({ minLength: 1 }),
  titulo: Type.Optional(Type.String()),
  data_hora_1: Type.String(),
  data_hora_2: Type.String(),
  numero_1: Type.Integer({ minimum: 0 }),
  numero_2: Type.Integer({ minimum: 0 }),
  numero_3: Type.Integer({ minimum: 0 }),
  origem: Type.Optional(Type.String()),
  leitura_sincronizada: Type.Optional(
    Type.Union([Type.Boolean(), Type.Integer({ minimum: 0, maximum: 2 })]),
  ),
});
export const leituraPatchSchema = Type.Partial(leituraBodySchema);
export type LeituraBody = Static<typeof leituraBodySchema>;
export type LeituraPatch = Static<typeof leituraPatchSchema>;

export const leituraQuerySchema = Type.Object({
  opcao_id: Type.Optional(Type.String()),
  md5: Type.Optional(Type.String()),
  sincronizada: Type.Optional(Type.String()),
  data_inicio: Type.Optional(Type.String()),
  data_fim: Type.Optional(Type.String()),
  modificado_depois: Type.Optional(Type.String()),
  page: Type.Optional(Type.String()),
  limit: Type.Optional(Type.String()),
  sort: Type.Optional(Type.String()),
  dir: Type.Optional(Type.String()),
});
export const exportCsvQuerySchema = Type.Object({
  opcao_id: Type.Optional(Type.String()),
  md5: Type.Optional(Type.String()),
  sincronizada: Type.Optional(Type.String()),
  data_inicio: Type.Optional(Type.String()),
  data_fim: Type.Optional(Type.String()),
  modificado_depois: Type.Optional(Type.String()),
});
export const idQuerySchema = Type.Object({
  id: Type.Optional(Type.String()),
});

// Filtro opcional do GET /api/stats. As datas são instantes UTC canônicos
// ("YYYY-MM-DDTHH:MM:SSZ"); o cliente converte o recorte local antes de chamar.
export const statsQuerySchema = Type.Object({
  data_inicio: Type.Optional(Type.String()),
  data_fim: Type.Optional(Type.String()),
});

export const livroConfigSchema = Type.Object({
  titulo: Type.String(),
  md5: Type.String(),
  autor: Type.Optional(Type.String()),
  imagem: Type.Optional(Type.String()),
  remover_imagem: Type.Optional(Type.Boolean()),
  oculto: Type.Optional(Type.Boolean()),
});
export const configBodySchema = Type.Object({
  livros: Type.Optional(Type.Array(livroConfigSchema)),
});
export const livroBodySchema = Type.Object({
  md5: Type.String(),
  titulo: Type.String(),
  autor: Type.Optional(Type.String()),
  imagem: Type.Optional(Type.String()),
});
export type LivroConfigItem = Static<typeof livroConfigSchema>;
export type ConfigBody = Static<typeof configBodySchema>;
export type LivroBody = Static<typeof livroBodySchema>;