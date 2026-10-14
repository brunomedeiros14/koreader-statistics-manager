import { Elysia } from "elysia";

import { pluginDownload, pluginManifest } from "../plugin";

export const pluginRoutes = new Elysia()
  .get(
    "/api/plugin",
    () => pluginManifest(),
    {
      detail: { summary: "Versão do plugin disponível no servidor", tags: ["Plugin"] },
    },
  )
  .get(
    "/api/plugin/download",
    () => pluginDownload(),
    {
      detail: { summary: "Baixa o pacote atualizado do plugin (.zip)", tags: ["Plugin"] },
    },
  );