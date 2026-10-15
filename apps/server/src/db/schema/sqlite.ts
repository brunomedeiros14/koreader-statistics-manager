import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Schema do dialeto SQLite (desenvolvimento local). É a fonte de verdade do
// drizzle-kit: as migrations são geradas a partir daqui (`bun run db:generate`)
// e aplicadas em runtime pelo migrator do drizzle-orm. Nunca edite as
// migrations à mão além do baseline idempotente.

export const opcao = sqliteTable(
  "opcao",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    titulo: text("texto").notNull(),
    autor: text("autor").notNull().default(""),
    imagem: text("imagem").notNull().default(""),
    md5: text("md5"),
    posicao: integer("posicao").notNull().default(0),
    oculto: integer("oculto", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [uniqueIndex("idx_opcao_md5").on(t.md5)],
);

export const leitura = sqliteTable(
  "leitura",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
      .default(sql`(datetime('now'))`),
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
