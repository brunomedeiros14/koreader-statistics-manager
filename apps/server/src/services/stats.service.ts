import type { StatsResponse } from "@leitura/common";

import { repo } from "../db";

export const computarStats = (): Promise<StatsResponse> => repo.stats();
