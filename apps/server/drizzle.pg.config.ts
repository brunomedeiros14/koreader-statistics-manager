import { defineConfig } from "drizzle-kit";

// Config do drizzle-kit para o dialeto Postgres (produção).
//
// Fonte de verdade do schema: src/db/schema/pg.ts. As migrations geradas ficam
// em drizzle/pg/ e são aplicadas em runtime pelo migrator do drizzle-orm (ver
// src/db/postgres.ts). Para alterar o schema:
//   1. edite o schema Drizzle;
//   2. `bun run db:generate:pg` na raiz do monorepo;
//   3. revise o SQL gerado (mantenha o baseline idempotente).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/pg.ts",
  out: "./drizzle/pg",
});
