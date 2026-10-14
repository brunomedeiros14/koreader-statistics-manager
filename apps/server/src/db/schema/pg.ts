import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Schema do dialeto Postgres (produção). As alterações de DDL no banco real são
// aplicadas via migrations versionadas em apps/server/src/db/migrations/pg.ts —
// mantenha este schema e as migrations em sincronia.

export const opcao = pgTable(
  "opcao",
  {
    id: serial("id").primaryKey(),
    titulo: text("texto").notNull(),
    autor: text("autor").notNull().default(""),
    imagem: text("imagem").notNull().default(""),
    md5: text("md5"),
    posicao: integer("posicao").notNull().default(0),
    oculto: boolean("oculto").notNull().default(false),
  },
  (t) => [uniqueIndex("idx_opcao_md5").on(t.md5)],
);

export const leitura = pgTable(
  "leitura",
  {
    id: serial("id").primaryKey(),
    tipo: text("tipo"),
    opcaoId: integer("opcao_id").references(() => opcao.id),
    opId: text("op_id"),
    origem: text("origem").notNull().default("web"),
    dataHora1: text("data_hora_1").notNull(),
    dataHora2: text("data_hora_2").notNull(),
    numero1: integer("numero_1").notNull(),
    numero2: integer("numero_2").notNull(),
    numero3: integer("numero_3").notNull(),
    md5: text("md5"),
    leituraSincronizada: integer("leitura_sincronizada").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
    updatedAt: text("updated_at"),
  },
  (t) => [
    uniqueIndex("idx_leitura_op_id").on(t.opId),
    index("idx_leitura_opcao_id").on(t.opcaoId),
    index("idx_leitura_data_hora_1").on(t.dataHora1),
    index("idx_leitura_md5").on(t.md5),
    index("idx_leitura_sincronizada").on(t.leituraSincronizada),
  ],
);
