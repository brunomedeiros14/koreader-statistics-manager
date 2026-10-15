# Arquitetura

Sistema de **registro manual de leituras** que conecta:

- um **servidor** (API + frontend) que guarda o catálogo de livros e o histórico de leituras;
- o **plugin de KOReader** (`leitura_manual.koplugin`), que registra leituras a partir do
  dispositivo e sincroniza estatísticas com o `statistics.sqlite3` do KOReader;
- uma **interface web** (estante, registro, edição, estatísticas).

## Visão geral

```
                ┌──────────────────────────────────────────┐
                │              Servidor (Bun)             │
                │  apps/server (Elysia API + SQLite)      │
                │  apps/web    (React SPA servido pelo    │
                │               mesmo processo)           │
                │  libs/common (tipos + validação)        │
                └──────────────────────────────────────────┘
                    ▲            ▲              ▲
     HTTP (LAN)     │            │              │  serve SPA + /api
                    │            │              │
   ┌────────────────┴───┐   ┌────┴────────┐   ┌─┴──────────┐
   │  Navegador (web)   │   │ KOReader    │   │  Navegador  │
   │  estante/sessão    │   │ (plugin)    │   │ (CSV, API   │
   └────────────────────┘   └─────────────┘   │  direta)    │
                                              └─────────────┘
```

O plugin conversa apenas com o servidor via HTTP (`/api/leitura`, `/api/livro`,
`/api/plugin`, `/api/opcoes`). As estatísticas são injetadas localmente no
`statistics.sqlite3` do KOReader pelo próprio plugin.

## Componentes

### `apps/server` — API Elysia + bun:sqlite (Drizzle)

- `src/server.ts` — entrada do app Elysia: OpenAPI, `onError` sanitizado,
  `/healthz`, montagem das rotas, estáticos e SPA (catch-all).
- `src/routes/` — um módulo por área: `config.ts` (config/opcoes/livro),
  `leitura.ts` (CRUD + export CSV), `stats.ts`, `plugin.ts`, `covers.ts`.
- `src/services/` — regras de negócio: `filtros.ts` (`buildWhere`),
  `livros.service.ts` (resolve/upsert/salvarConfig), `leitura.service.ts`
  (CRUD com consistência e reset de sincronização), `stats.service.ts`.
- `src/db/index.ts` — abertura do SQLite `data/leitura.sqlite3`, pragmas (WAL,
  foreign_keys) e aplicação das migrations (drizzle-kit) pelo migrator do
  drizzle-orm.
- `src/db/schema/{sqlite,pg}.ts` — schema Drizzle por dialeto (fonte de verdade).
- `src/validation.ts` — validação pura dos payloads POST/PATCH de leitura;
  o auto-cadastro de livros por `md5` vive em `services/livros.service.ts`.

### `apps/web` — Frontend (Vite + TanStack Router + Tailwind v4)

- `src/main.tsx` + `src/routes/__root.tsx` — bootstrap e layout raiz.
- Rotas (geradas em `routeTree.gen.ts`):
  - `/` — estante de livros + leitura ativa (temporizador).
  - `/iniciar?livro=` — criação de uma sessão de leitura.
  - `/adicionar?livro=` — registro manual direto.
  - `/registros` — listagem, filtros, ordenação, edição, exclusão, estatísticas e CSV.
  - `/config` — cadastro/ordenação de livros, preferência de modo da estante.
- `src/api.ts` — cliente HTTP tipado.
- `src/sessao.ts` — sessão de leitura ativa em `localStorage`.
- `src/preferencias.ts` — preferência de visualização em `localStorage`.
- `src/util.ts` — formatadores de data/tempo e gerador de `op_id`.

### `libs/common` — Tipos e valores compartilhados

- `src/domain.ts` — interfaces de domínio (tabelas `opcao`/`leitura`, payloads).
- `src/api-schemas.ts` — schemas TypeBox das rotas.
- `src/domain.ts` — interfaces de domínio, payloads da API, validadores
  (`isValidIso`, `isValidMd5`, `isValidNumero`, `isValidSyncStatus`, `toNumber`).
- `src/index.ts` — reexporta ambos.

Usado por server e web; serve como "contrato" de tipos entre as duas pontas.

### `leitura_manual.koplugin` — Plugin Lua do KOReader

| Arquivo | Responsabilidade |
| --- | --- |
| `_meta.lua` | Metadados do plugin (`version`, `fullname`). O servidor lê a `version` daqui no `/api/plugin`. |
| `main.lua` | Menu do plugin; orquestra formulário, sincronização, histórico, estatísticas, atualização. |
| `wizard.lua` | Wizard de 6 passos para registrar uma leitura manualmente. |
| `current_book.lua` | Detecta o livro aberto no KOReader (md5, título, autor) pela mesma fonte do `statistics`. |
| `stats_books.lua` | Lista livros com md5 do `statistics.sqlite3` (para escolha no wizard). |
| `leitura_outbox.lua` | Cache local (`leitura_outbox.sqlite3`) + fila de envio (outbox) idempotente. |
| `leitura_api.lua` | Cliente HTTP (socket.http) para os endpoints do servidor. |
| `stats_sync.lua` | Tradução/inserção de leituras em `page_stat_data` do `statistics.sqlite3`. |
| `book_sync.lua` | Envio do livro atual (título/autor/capa base64) ao servidor. |
| `plugin_update.lua` | Verifica/download/instalação atômica de novas versões do plugin. |
| `paginated_list.lua` | Widget de lista paginada genérico (usado no histórico). |

### Infra / ferramentas

- `docker/` — `Dockerfile` (build frontend + runtime Bun), `docker-compose.yml`,
  `entrypoint.sh` (ajuste de dono do volume `data/`).
- `scripts/build-plugin.sh` — gera `dist/leitura_manual.zip`.
- `watch.sh` — utilitário local (Mac): copia o plugin para o KOReader e reinicia.
- `.github/workflows/docker-publish.yml` — CI que publica a imagem em GHCR (linux/arm64).
- `.only-local/` — scripts locais/descartáveis (gitignored; contém um `statistics.sqlite3`
  copiado do dispositivo e utilitários de scp).

## Decisões importantes

- **Monorepo Bun**: workspaces `apps/*` + `libs/*`; `bun run dev` sobe API e web em paralelo.
- **Tipos comuns**: `@leitura/common` é o contrato de tipos e validação entre server/web.
- **Idempotência**: `md5` é a chave de idempotência de livros; `op_id` é a de registros.
- **Sincronização em 2 camadas**: todo registro nasce local (outbox no dispositivo) e é
  enviado ao servidor; depois o servidor devolve registros "não sincronizados" que o
  plugin injeta no `statistics.sqlite3`.
- **Auto-cadastro**: o servidor cadastra automaticamente um livro (`opcao`) quando recebe
  uma leitura com `md5` desconhecido + `titulo`.
- **Estado de sincronização**: `leitura_sincronizada` em `leitura`: `0` = em espera,
  `1` = sincronizado (injeta em `page_stat_data`), `2` = pulado (livro ausente).

## Limitações conhecidas

- Sem autenticação (rede local aberta).
- Datas armazenadas como string `YYYY-MM-DDTHH:MM` **sem timezone** (naive). A interpretação
  local depende do cliente que gerou o dado.
- Sem testes automatizados e sem CI de typecheck.
- Tabela `campo` do schema legado está sem uso.
- Ordenação da tabela em `/registros` é feita **no cliente, apenas sobre a página atual**.