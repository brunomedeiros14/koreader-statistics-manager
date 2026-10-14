# provisório

Monorepo (Bun workspaces) para o servidor e a interface do plugin de leitura
manual:

```
apps/server   @leitura/server   API Elysia + bun:sqlite (Drizzle)
apps/web      @leitura/web      Frontend React (Vite + TanStack Router + Tailwind)
libs/common   @leitura/common   Tipos e validações compartilhados
```

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — visão geral do sistema e componentes
- [`docs/SCHEMAS.md`](docs/SCHEMAS.md) — bancos SQLite, localStorage e payloads
- [`docs/FLUXOS.md`](docs/FLUXOS.md) — fluxos de dados (web, plugin, sync de estatísticas)
- [`docs/API.md`](docs/API.md) — referência das rotas HTTP
- [`docs/PLANO_DE_MELHORIAS.md`](docs/PLANO_DE_MELHORIAS.md) — plano de melhorias por prioridade

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