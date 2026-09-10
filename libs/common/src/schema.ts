import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const opcao = sqliteTable("opcao", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  titulo: text("texto").notNull(),
  md5: text("md5"),
  posicao: integer("posicao").notNull().default(0),
});

export const leitura = sqliteTable("leitura", {
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
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export type OpcaoRow = typeof opcao.$inferSelect;
export type OpcaoInsert = typeof opcao.$inferInsert;
export type LeituraRow = typeof leitura.$inferSelect;
export type LeituraInsert = typeof leitura.$inferInsert;