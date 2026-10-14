import { Elysia } from "elysia";

import { computarStats } from "../services/stats.service";

export const statsRoutes = new Elysia().get(
  "/api/stats",
  () => computarStats(),
  { detail: { summary: "Estatísticas agregadas", tags: ["Leitura"] } },
);