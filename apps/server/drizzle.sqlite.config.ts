import { defineConfig } from "drizzle-kit";

// Config do drizzle-kit para o dialeto SQLite (desenvolvimento local).
//
// Fonte de verdade do schema: src/db/schema/sqlite.ts. As migrations geradas
// ficam em drizzle/sqlite/ e são aplicadas em runtime pelo migrator do
// drizzle-orm (ver src/db/sqlite.ts). Para alterar o schema:
//   1. edite o schema Drizzle;
//   2. `bun run db:generate:sqlite` na raiz do monorepo;
//   3. revise o SQL gerado (mantenha o baseline idempotente).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/sqlite.ts",
  out: "./drizzle/sqlite",
});
