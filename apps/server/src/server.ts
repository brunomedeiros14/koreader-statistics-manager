import { openapi } from "@elysia/openapi";
import { Elysia } from "elysia";
import { existsSync } from "fs";
import { join } from "path";

import { autorizado, authAtiva, tokenParaWeb } from "./auth";
import { repo } from "./db";
import { configRoutes } from "./routes/config";
import { coversRoutes } from "./routes/covers";
import { leituraRoutes } from "./routes/leitura";
import { pluginRoutes } from "./routes/plugin";
import { statsRoutes } from "./routes/stats";

const PORT = Number(process.env.PORT ?? 3000);

const WEB_DIST = join(import.meta.dir, "../../web/dist");
const INDEX_HTML = join(WEB_DIST, "index.html");
const hasWebBuild = existsSync(INDEX_HTML);

// B.2: quando habilitado, injeta o token no SPA para o navegador autenticar
// as chamadas /api sem expor o token no código estático.
const spa = async (): Promise<Response> => {
  if (!hasWebBuild) {
    return new Response(
      "Frontend ainda não compilado — rode 'bun run dev' na raiz do monorepo.",
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  let html = await Bun.file(INDEX_HTML).text();
  if (authAtiva) {
    const meta = `<meta name="leitura-token" content="${tokenParaWeb()}">`;
    html = html.includes("<head>")
      ? html.replace("<head>", "<head>\n    " + meta)
      : meta + html;
  }
  // B.8: o shell HTML nunca deve ficar em cache (os assets têm hash no nome).
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
};

const asset = async (name: string): Promise<Response> => {
  const file = Bun.file(join(WEB_DIST, "assets", name));
  return (await file.exists())
    ? new Response(file, {
        // B.8: assets com hash de conteúdo são imutáveis e cacheados por muito.
        headers: { "Cache-Control": "public, max-age=31536000, immutable" },
      })
    : new Response("Not found", { status: 404 });
};

// B.3: limite de corpo cobre o pior caso de capa base64 (8 MB decodificados
// ≈ 10,7 MB em texto) sem aceitar payloads arbitrários.
const BODY_LIMIT = 12 * 1024 * 1024;

const app = new Elysia({ serve: { maxRequestBodySize: BODY_LIMIT } })
  .use(
    openapi({
      path: "/openapi",
      documentation: {
        info: {
          title: "Leitura Manual API",
          version: "1.0.0",
          description: "API do plugin Leitura Manual (provisório).",
        },
      },
    }),
  )
  // B.2: protege as rotas /api/* quando LEITURA_TOKEN está definido. Healthz,
  // openapi e o SPA estático permanecem públicos.
  .onBeforeHandle(({ request, set }) => {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/") && !autorizado(request.headers.get("authorization"))) {
      set.status = 401;
      return { ok: false, error: "Não autorizado" };
    }
  })
  .onError(({ code, error, set, request }) => {
    if (code === "VALIDATION" || code === "PARSE") {
      set.status = 400;
      let detail = "";
      if (code === "VALIDATION" && error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message) as { summary?: unknown };
          if (typeof parsed?.summary === "string") detail = parsed.summary;
        } catch {
          detail = "";
        }
      }
      return {
        ok: false,
        error:
          detail ||
          (code === "PARSE" ? "Dados inválidos" : "Requisição inválida"),
      };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found" };
    }
    // Never leak internal details to the client.
    console.error(`[leitura] erro interno ${request.method} ${request.url}`, error);
    set.status = 500;
    return { ok: false, error: "Erro interno" };
  })
  .get("/healthz", async ({ set }) => {
    try {
      await repo.ping();
      return { ok: true };
    } catch (err) {
      console.error("[leitura] healthz falhou", err);
      set.status = 500;
      return { ok: false };
    }
  })

  .use(configRoutes)
  .use(leituraRoutes)
  .use(statsRoutes)
  .use(pluginRoutes)
  .use(coversRoutes)

  .get("/assets/*", ({ params }) => asset(params["*"] ?? ""), {
    detail: { hide: true },
  })
  .get("/*", async ({ request }) => {
    const path = new URL(request.url).pathname;
    if (path === "/openapi" || path.startsWith("/openapi/")) {
      return new Response("Not found", { status: 404 });
    }
    if (path.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Serve static files at the SPA root (favicon, manifest, etc. — the Vite
    // "public" dir ends up inside dist/), then fall back to the SPA shell.
    // request.url pathname is already normalized, so this stays inside dist/.
    const file = Bun.file(join(WEB_DIST, path.slice(1)));
    if (await file.exists()) {
      return new Response(file);
    }
    return spa();
  })
  .listen(PORT);

console.log(`Servidor rodando em http://localhost:${app.server?.port ?? PORT}`);
console.log(`OpenAPI UI: http://localhost:${app.server?.port ?? PORT}/openapi`);