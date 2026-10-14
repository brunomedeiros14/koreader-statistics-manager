import { Elysia } from "elysia";
import { existsSync } from "fs";
import { join } from "path";

import { COVERS_DIR, COVER_FILE_RE } from "../covers";

export const coversRoutes = new Elysia().get(
  "/covers/:file",
  ({ params, set }) => {
    const file = params.file;
    if (!COVER_FILE_RE.test(file)) {
      set.status = 400;
      return new Response("Arquivo inválido", { status: 400 });
    }
    const path = join(COVERS_DIR, file);
    if (!existsSync(path)) {
      set.status = 404;
      return new Response("Not found", { status: 404 });
    }
    const mime = file.endsWith(".png")
      ? "image/png"
      : file.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return new Response(Bun.file(path), {
      // Capa pode ser reenviada para o mesmo md5 → cache curto (e não imutável).
      headers: { "Content-Type": mime, "Cache-Control": "public, max-age=86400" },
    });
  },
  { detail: { hide: true } },
);