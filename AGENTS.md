# AGENTS.md — Guia para sessões de agentes

Documento de contexto para agentes de código (opencode, etc.) trabalharem neste
repositório com assertividade. Leia **antes** de implementar. Mantenha este arquivo
atualizado quando mudar estrutura, convenções ou comandos.

## 1. O que é o projeto

Sistema de **registro manual de leituras** com três pontas:

- **Servidor** (Bun + Elysia) que serve a API `/api/*`, as capas `/covers/*` e o
  SPA do frontend a partir do mesmo processo.
- **Interface web** (React SPA) para estante, registro/edição e estatísticas.
- **Plugin de KOReader** (Lua, `leitura_manual.koplugin/`) que registra leituras,
  sincroniza com o `statistics.sqlite3` nativo e baixa atualizações do servidor.

Sem autenticação por padrão; quando `LEITURA_TOKEN` está definido, as rotas
`/api/*` exigem `Authorization: Bearer`.

Docs humanas em `docs/` (ARQUITETURA, SCHEMAS, FLUXOS, API) — úteis, mas
**parcialmente desatualizadas** (ver §9). Este AGENTS.md é o guia operacional.

## 2. Comandos (rode da raiz)

```bash
bun install            # instala workspaces
bun run dev            # server (:3000) + web (:5173, proxy /api|/covers|/openapi)
bun run typecheck      # tsc em common → server → web (use SEMPRE antes de encerrar)
bun test               # bun test em todos os pacotes
bun run build          # vite build do web (regenera routeTree.gen.ts)
bun run start          # sobe o server servindo apps/web/dist
bun run build-plugin   # gera dist/leitura_manual.zip (scripts/build-plugin.sh)
```

Não há ESLint/Prettier/ruff configurados. Padronize a formatação manualmente
(§6). CI (`docker-publish.yml`, em push para `main`) roda `bun run typecheck` +
`bun run test` e publica a imagem ARM64.

## 3. Arquitetura de pastas

```
apps/server   @leitura/server   API Elysia + Drizzle (SQLite ou Postgres)
apps/web      @leitura/web      React 19 + Vite + TanStack Router + Tailwind v4
libs/common   @leitura/common   Contrato de tipos + schemas TypeBox + validadores
leitura_manual.koplugin/        Plugin Lua do KOReader
docs/                           Documentação humana
scripts/build-plugin.sh         Empacota o plugin
docker/                         Dockerfile + compose + entrypoint
prototipos/                     HTMLs estáticos de referência visual (não usados em runtime)
.github/workflows/              CI (typecheck, test, publish GHCR)
.only-local/                    Scripts/dados locais (gitignored: statistics.sqlite3, todo.md, util.sh)
data/                           SQLite do servidor em runtime (gitignored)
dist/                           Artefatos de build (gitignored)
```

### Responsabilidades por pacote

| Pacote | É dono de | NÃO deve conter |
| --- | --- | --- |
| `libs/common` | Interfaces de domínio, payloads, validação pura (`isValid*`, `normalizarUtc`, `agoraUtc`), schemas TypeBox das rotas (`api-schemas.ts`), schemas Drizzle reexportados | I/O, acesso a banco, acesso a `process.env`, código de browser/server |
| `apps/server` | Rotas HTTP, services (regra de negócio), `Repo` + adaptadores de dialeto, migrations, auth | Regra de negócio em rotas, dialeto em services, tipos duplicados que pertençam ao contrato |
| `apps/web` | Componentes, rotas, cliente HTTP (`api.ts`), helpers de data/UI, estado local (localStorage) | Regra de negócio do servidor, SQL, escrita em `statistics.sqlite3` |
| `leitura_manual.koplugin` | Captura no dispositivo, outbox/offline, injeção em `statistics.sqlite3`, auto-update | Falar com qualquer coisa que não seja HTTP do servidor |

`@leitura/common` é o **contrato** entre server e web (resolvido por `paths` do
tsconfig; `optimizeDeps.exclude` no Vite). Mudou um tipo/payload? Atualize aqui
primeiro e propague.

## 4. Server (`apps/server`)

Fluxo obrigatório de uma requisição:
`routes/*.ts` (validação TypeBox + mapeia `set.status`) → `services/*.ts` (regra
de negócio, retorna objeto-resultado) → `db` (`repo`) → adaptador de dialeto.

- **`server.ts`**: monta OpenAPI, `onBeforeHandle` de auth, `onError` sanitizado
  (nunca vaza detalhes internos; VALIDATION/PARSE→400, NOT_FOUND→404, resto→500),
  `/healthz`, estáticos `/assets/*`, `/covers/*` e catch-all do SPA (`index.html`
  com `no-cache`; assets com hash são `immutable`).
- **`routes/`**: um arquivo por área (`leitura`, `config`, `stats`, `plugin`,
  `covers`). Use os schemas de `@leitura/common` (`api-schemas.ts`) em
  `query`/`body`. Mapeie erros com `res.status ?? 400`.
- **`services/`**: retornam union discriminada
  `{ ok: true; ... } | { ok: false; error: string; status?: number }` — nunca
  lançam para erros de domínio. `leitura.service.ts` cuida de idempotência
  (`op_id`), revalidação cruzada em PATCH e do flag `leitura_sincronizada`
  (editar campos de stats volta para `0` e move `updated_at`).
- **`validation.ts`**: validação pura do payload POST/PATCH. Normaliza datas para
  UTC canônico via `normalizarUtc`. Auto-cadastro de livro por `md5` fica em
  `services/livros.service.ts`.
- **`db/index.ts`**: `repo` é instância única (top-level await) escolhida por
  `DB_DRIVER` via import dinâmico. Services/rotas usam só `repo`.
- **`db/types.ts`**: interface `Repo` — contrato único de persistência. Todo novo
  método precisa de implementação **idêntica** em `db/sqlite.ts` e `db/postgres.ts`.
- **`db/filtros.ts`**: `buildWhere` compartilhado (alias `l`, então a consulta
  base DEVE ser `FROM leitura l`), `buildOrderBy` (whitelist de colunas),
  expressões de duração por dialeto (`DURACAO_SQLITE`/`DURACAO_PG`).
- **`db/config.ts`**: único lugar que lê `process.env` de banco
  (`DB_DRIVER`, `DB_SQLITE_PATH`, `DB_POSTGRES_*`). Não leia env de banco em outro
  módulo.
- **`db/schema/{sqlite,pg}.ts`** + **`db/migrations/{sqlite,pg}.ts`**: schema
  Drizzle é a referência tipada; a DDL real roda por migrations **versionadas e
  idempotentes** registradas em `_migrations`. **Mantenha schema e migration em
  sincronia** — ao adicionar coluna/tabela, crie um novo passo `000N-nome` (nunca
  edite um passo já aplicado) nos dois dialetos.
- **`auth.ts`**: token opcional em tempo constante; injeta
  `<meta name="leitura-token">` no SPA quando ativo (`api.ts` lê essa meta).

## 5. Web (`apps/web`)

- **Bootstrap**: `main.tsx` (`createRouter` + `ErrorBoundary`) → `routes/__root.tsx`
  (layout + `Sidebar`). `routeTree.gen.ts` é **gerado** (tem `@ts-nocheck`); não
  edite à mão — rode `bun run build`/`bun run dev`.
- **Rotas TanStack Router**: um arquivo em `src/routes/`. Cada rota exporta
  `Route`. Para parâmetros de busca use `validateSearch`. **Atenção**: retorne o
  tipo com chave opcional (`: { md5?: string }`) e, ao linkar para uma rota com
  `validateSearch`, passe `search={{ ... }}` — senão o typecheck exige `search` em
  todos os `<Link>`.
- **Cliente HTTP**: `src/api.ts` — cada função é um wrapper de `fetch` tipado com
  o contrato de `@leitura/common`; envia o Bearer da meta automaticamente.
- **Fetch de dados**: use `useApi(fn, deps)` (`hooks/useApi.ts`) para GET —
  devolve `{ dados, carregando, erro, recarregar }` e lida com cancelamento.
  Observação: ele desliga a regra de exhaustive-deps de propósito.
- **Datas**: `lib/format.ts` (formatação + conversão `paraUtc`/`paraUtcData`) e
  `lib/calendario.ts` (recortes por dia **no fuso do navegador**:
  `chaveDiaLocal`, `minutosPorDiaLocal`, `diaDeslocado`, `intervaloUtcDoDia`).
  Envie sempre UTC canônico à API; converta na borda.
- **localStorage**: sempre via wrapper (`sessao.ts`, `preferencias.ts`) com
  try/catch — nunca acesso cru espalhado.
- **Estilo (Tailwind v4)**: tokens de tema em `src/index.css` (`@theme`), com
  dark mode via `prefers-color-scheme`. Prefira as classes de componente:
  `.card`, `.btn`/`.btn-primario`/`.btn-outline`/`.btn-suave`/`.btn-icone`,
  `.badge`, `.th`/`.td`, `.eyebrow`, `.titulo-pag`, `.label`, `.input`, `.select`.
  Cores de marca: `tinta*`, `papel*`, `desk*`, `linha*`, `fita*`. Componentes
  reutilizáveis ficam em `src/components/` (ex.: `Modal`, `DetalhesSessao`,
  `StatPaineis`, `BannerErro`).
- **Modal**: use `components/Modal.tsx` (`open`/`onClose`, `<dialog>` nativo).
- **Sem gerenciador de estado global**: use `useApi` + `useState`/URL search
  params. Filtros navegáveis devem ir para a URL quando fizer sentido
  (ex.: `/registros?md5=`, `/estatisticas?dia=`).

## 6. Convenções de código

- **Nomes**: domínio em **português** (funções, variáveis, campos de API e
  colunas do banco). Arquivos e identificadores em `camelCase`; tipos/componentes
  em `PascalCase`; colunas SQL em `snake_case`. Adapter de dialeto traduz
  `snake_case ↔ camelCase` (tipos neutros em `domain.ts`).
- **Formatação**: 2 espaços, aspas duplas, ponto e vírgula, vírgula final,
  ~80 colunas. Sem comentários óbvios: comente o **porquê** (decisão/armadilha),
  não o quê.
- **Datas**: forma canônica **UTC** `"YYYY-MM-DDTHH:MM:SSZ"` (sem ms). Formato
  legado naive `"YYYY-MM-DDTHH:MM"` ainda é aceito na entrada e normalizado como
  UTC. Nunca armazene hora local sem timezone.
- **Erros no server**: erros de domínio são valores (`{ ok: false, error, status }`);
  exceções só para falhas inesperadas (caem no `onError` sanitizado).
- **SQL**: sempre parametrizado (`sql` do Drizzle ou `?`/`$n`); ordenação só por
  whitelist (`buildOrderBy`); nunca interpole entrada do usuário.
- **Sem dependências novas** sem necessidade clara e sem checar `package.json` do
  workspace — prefira o que já existe.
- **Mutações web** (POST/PATCH/DELETE) tratam `{ ok: false, error }` e dão
  feedback; leituras usam `useApi`.

## 7. Testes

- Runner: `bun test`. Arquivos `*.test.ts` ao lado do código-fonte.
- `libs/common`: testes puros de validação/domínio.
- `apps/server`: testes de service batem no banco real — **defina
  `DB_SQLITE_PATH` para um arquivo temporário ANTES de importar `./db`**
  (ver `services/leitura.service.test.ts`; use `mkdtempSync`).
- `apps/web`: testes puros de helpers em `src/lib/*.test.ts`.
- Sempre rode `bun run typecheck` + `bun test` antes de concluir. Se alterar só
  web, `bun run build` valida a geração de rotas.

## 8. Plugin KOReader (`leitura_manual.koplugin/`)

Lua; ver `docs/ARQUITETURA.md` e `docs/FLUXOS.md` para detalhes. Mapa rápido:
`main.lua` (menus), `wizard.lua` (coleta), `core/` (livro atual/sync),
`data/leitura_outbox.lua` (fila offline idempotente por `op_id`),
`data/stats_sync.lua` (injeção idempotente em `page_stat_data`),
`api/leitura_api.lua` (HTTP), `api/plugin_update.lua` (auto-update),
`ui/` (widgets). Versão do plugin é lida de `_meta.lua` pelo servidor.

## 9. Dívidas / pontos de atenção conhecidos

- `docs/ARQUITETURA.md`, `SCHEMAS.md` e `FLUXOS.md` ainda descrevem as datas como
  naive e referenciam `libs/common/src/schema.ts` / `db/schema.ts` (hoje
  `db/schema/{sqlite,pg}.ts` e `domain.ts`/`api-schemas.ts`) e
  `docs/PLANO_DE_MELHORIAS.md` (arquivo inexistente). Comentários no código citam
  tags de plano (A.1, B.2, K.1…) que não estão versionadas.
- Migrations manuais devem migrar para **drizzle-kit** (nota em
  `.only-local/todo.md`).
- Tabela legada `campo` já foi removida pela migration `0002`.
- Índices únicos (`idx_opcao_md5`, `idx_leitura_op_id`) existem na DDL/migrations
  e nos schemas Drizzle, mas confira paridade ao mexer.
- Ordenação em `/registros` é **client-side apenas da página atual** (backend
  pagina com `LIMIT/OFFSET`).
- Sem autenticação por padrão (rede local assumida).

## 10. Checklist antes de encerrar uma tarefa

1. `bun run typecheck` limpo.
2. `bun test` verde (não quebre os testes existentes; adicione cobertura para
   regra nova).
3. Se mexeu no web: `bun run build` ok.
4. Sem `console.log` esquecido, sem segredos, sem `any` desnecessário.
5. Atualizou este AGENTS.md ou `docs/` se a mudança alterou estrutura/convenções.
6. Só faça commit quando explicitamente solicitado. Mensagens de commit seguem
   Conventional Commits em inglês (`feat:`, `fix:`, `chore:`…), no imperativo.
