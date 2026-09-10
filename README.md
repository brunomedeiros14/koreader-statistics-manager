# provisório

Monorepo (Bun workspaces) para o servidor e a interface do plugin de leitura
manual:

```
apps/server   @leitura/server   API Elysia + bun:sqlite (Drizzle)
apps/web      @leitura/web      Frontend React (Vite + TanStack Router + Tailwind)
libs/common   @leitura/common   Tipos e validações compartilhados
```

## Instalando

```bash
bun install
```

## Desenvolvimento

```bash
bun run dev
```

Sobe em paralelo:
- API em http://localhost:3000 (OpenAPI em /openapi)
- Frontend em http://localhost:5173 (proxy de /api para a API)

## Produção

```bash
bun run build   # compila o frontend em apps/web/dist
bun run start   # servidor serve a API + o SPA compilado
```

Docker: `docker compose -f docker/docker-compose.yml up --build`