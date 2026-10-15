import { statsQuerySchema } from "@leitura/common";
import { Elysia } from "elysia";

import { computarStats } from "../services/stats.service";

export const statsRoutes = new Elysia().get(
  "/api/stats",
  ({ query }) => computarStats(query),
  {
    query: statsQuerySchema,
    detail: {
      summary: "Estatísticas agregadas (filtro opcional por intervalo)",
      tags: ["Leitura"],
    },
  },
);