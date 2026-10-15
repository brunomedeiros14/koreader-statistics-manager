import type { StatsResponse } from "@leitura/common";

import { repo } from "../db";
import type { FiltrosLeitura } from "../db/filtros";

export const computarStats = (
  filtros: FiltrosLeitura = {},
): Promise<StatsResponse> => repo.stats(filtros);
