# Fluxos de dados

## 1. Registro de leitura pela Web

Caminhos possíveis:

- **Sessão ativa** (`/iniciar?livro=<id>` → `/`): `iniciar.tsx` salva a sessão em
  `localStorage`; `index.tsx` (`LeituraAtiva`) mostra o temporizador; ao **Finalizar**,
  o modal pede página final, total de páginas e hora de fim; `POST /api/leitura` é
  disparado com `op_id = crypto.randomUUID()` e `origem: "web"`.
- **Registro direto** (`/adicionar?livro=<id>`): `adicionar.tsx` preenche início/fim/páginas
  (com prefill da última leitura via `apiBuscarUltimaLeitura(md5)`) e envia `POST /api/leitura`.
- **Validação no servidor**: `validation.ts` valida o payload; `livros.service`
  resolve/auto-cadastra o livro por `md5`; `leitura.service` insere a linha.
  Reenvio com o mesmo `op_id` retorna a linha existente
  (resposta `{ ok: true, duplicado: true }`).

```
Navegador ──POST /api/leitura──▶ Servidor
                                   ├─ op_id já existe? → 200 {ok,duplicado}
                                   ├─ valida payload → 400
                                   └─ resolveLivro(md5) → auto-cadastro em "opcao"
                                      → INSERT "leitura" → 200 {ok, id}
```

## 2. Registro de leitura pelo plugin (KOReader)

`wizard.lua`:

1. Lista livros de `statistics.sqlite3` (`stats_books.list`), ordenados pela última leitura.
2. Se um livro está aberto no KOReader (`current_book.get`), pula a seleção.
3. Coleta: data/hora 1 (passo 2), data/hora 2 (passo 3), página inicial (passo 4),
   página final (passo 5), total de páginas (passo 6).
4. Gera `op_id` (hex de tempo+aleatório) e chama `LeituraOutbox.addRecord(payload)`.

`leitura_outbox.lua`:

- `addRecord` grava o payload em **`cache_registros`** (INSERT OR REPLACE por `op_id`)
  e encosta na fila **`outbox`** (status `pending`).
- `scheduleFlush` aguarda 5 s (debounce) e chama `flush`.
- `flush` envia até 200 itens em lote por `POST /api/leitura`:
  - sucesso → `outbox.status = done`, `cache_registros.synced = 1`, payload atualizado
    com `id` do servidor;
  - erro de validação → `outbox.status = failed` (não retenta);
  - erro de rede → para o lote e mantém `pending` (retenta depois).

```
Wizard ──▶ addRecord ──▶ outbox(pending) + cache_registros
            │
            └─(5s debounce)─▶ flush ──▶ POST /api/leitura (idempotente via op_id)
                                         ├─ ok ──▶ done / synced=1
                                         ├─ 4xx ─▶ failed
                                         └─ rede ─▶ pending (retry)
```

## 3. Sincronização de estatísticas (`statistics.sqlite3`)

Menu "Sincronizar estatísticas" → `main.lua:syncStats`, em duas passadas:

1. **Passada 1 (local/offline)**: para cada `outbox` pendente, `stats_sync.run(payload)`
   injeta direto no `statistics.sqlite3` (funciona mesmo sem rede).
2. **Passada 2 (servidor)**: `listUnsynced(page, 200)` puxa registros com
   `leitura_sincronizada = 0`; cada um é injetado via `stats_sync.run`; em seguida:
   - sucesso → `PATCH /api/leitura` marcando `leitura_sincronizada = 1` (synced);
   - livro ausente no `statistics.sqlite3` → marca como `2` (skipped, nunca sincronizável);
   - falha → mantém em espera e registra erro.

`stats_sync.run(record)`:

- Converte `data_hora_1/2` (ISO naive) para timestamps Unix.
- Localiza `book` por `md5`; resolve o total de páginas de referência
  (`getReferenceTotalPages`: último `page_stat_data.total_pages`, senão `book.pages`).
- Converte páginas do livro físico → páginas KOReader com `referencePage` (rescale
  proporcional).
- Distribui o tempo de leitura uniformemente por cada página e insere
  `INSERT OR IGNORE INTO page_stat_data` em transação → idempotente.

Limitação: registros **editados** no servidor depois de sincronizados não são
reprocessados (o `UNIQUE(id_book,page,start_time)` ignora a duplicata).

## 4. Sincronização do livro atual (plugin → servidor)

Menu "Sincronizar livro" → `book_sync.lua`:

1. `CurrentBook.get(ui)` resolve `md5` (doc_props → `partial_md5_checksum` → `util.partialMD5`),
   título e autor.
2. Gera a capa em base64 (`book_sync.coverBase64`): `getCoverPageImage()` →
   `writePNG` temporário → base64 (descarta se imagem > 4096 px).
3. `POST /api/livro` com `{ md5, titulo, autor, imagem }`.
4. Servidor: idempotente por `md5` — atualiza se existe, insere no fim da lista se novo
   (`posicao = max+1`) e persiste a capa em `data/covers/` (`resolveCover`).

```
plugin ──POST /api/livro──▶ servidor
                             ├─ md5 existe? ──▶ UPDATE (título/autor/imagem)
                             └─ md5 novo? ────▶ INSERT, posicao = max+1
                             capa base64 ────▶ data/covers/<md5>.png|jpg|webp
```

## 5. Configuração de livros pela Web

- `GET /api/opcoes` e `GET /api/config` retornam a lista ordenada por `posicao, id`.
- `POST /api/config` **substitui a lista inteira**:
  1. Desliga `foreign_keys` (a transação não aceitaria PRAGMA);
  2. `DELETE FROM opcao` + reinsere os válidos (título não vazio, md5 32-hex, sem
     duplicados), preservando `autor/imagem` já conhecidos por `md5`;
  3. Remapeia `leitura.opcao_id` por `md5`, com fallback legado `texto = tipo`;
  4. Reativa `foreign_keys`; limpa capas órfãs (`limparCapasOrfas`).

Risco conhecido: registros cujo md5 não esteja mais mapeado ficam com `opcao_id`
apontando para um id inexistente (FK off); a UI cobre via `COALESCE(o.texto, l.tipo)`.

## 6. Capas

- Entrada: base64 puro ou `data:image/...;base64,...` (`POST /api/config` / `/api/livro`).
- `resolveCover` grava em `data/covers/<md5>.<ext>` e devolve `covers/<md5>.<ext>`.
- Caminho já relativo `covers/...` é aceito sem re-escrita.
- Servidas em `GET /covers/:file` (validação de nome por regex).
- `limparCapasOrfas` remove arquivos não referenciados por nenhum `opcao.imagem`.

## 7. Histórico e Estatísticas do plugin (locais)

- `LeituraOutbox.listRecords()` lê `cache_registros` e alimenta:
  - Histórico: lista paginada (`PaginatedList`); cada item abre Confirmação para excluir
    (`deleteRecord` → remove localmente e, se `synced`, também no servidor via DELETE).
  - Estatísticas locais: agregado simples (nº de registros, tempo total, contagem por livro).
- `pullFromServer()` sincroniza o espelho local com a lista do servidor (para uso offline).

## 8. Atualização do plugin

`plugin_update.lua`:

1. `GET /api/plugin` → `{ nome, versao }` (lida do `_meta.lua` no servidor).
2. Compara semver (`isNewer`). Se há versão mais nova, perguntar ao usuário.
3. `Download` → `unpackZip` (ffi/archiver; fallback `Device:unpackArchive`) para staging.
4. Troca atômica: backup do plugin atual → renomeia staging → limpa.
5. Oferece reiniciar o KOReader (exit code 85 = reboot).

## 9. Exportação CSV

- `GET /api/export.csv` com os mesmos filtros do `GET /api/leitura`.
- Gera RFC 4180 com BOM (UTF-8), cabeçalho fixo
  `id,titulo,md5,data_hora_1,data_hora_2,numero_1,numero_2,numero_3,created_at`.

## 10. Visualização de registros e estatísticas (Web)

`registros.tsx`:

- Filtros: livro (`md5`), status KOReader (`sincronizada`), intervalo (`data_inicio/fim`).
- Paginação server-side (`limit/page`); **ordenação client-side apenas da página atual**.
- Estatísticas globais + séries por livro/dia/mês (`GET /api/stats`).
- Editar (PATCH) e excluir (DELETE) via modal.

---

## Diagrama de comunicação global

```
        Web (React)                     Servidor (Bun)                KOReader plugin
   ┌──────────────────┐          ┌──────────────────────┐       ┌─────────────────────┐
   │ /  estante        │          │ API Elysia          │       │ wizard.lua          │
   │ /iniciar, /adicionar │──POST──▶ /api/leitura        │◀─POST── leitura_outbox    │
   │ /registros        │──GET────▶ /api/leitura,/stats  │        (outbox + cache)   │
   │ /config           │──GET/POST▶ /api/config,/livro  │◀─POST── book_sync (capa)  │
   │                   │          │ /api/plugin[/download]  │◀─GET── plugin_update   │
   │ localStorage      │          │ leitura.sqlite3    │       │ statistics.sqlite3  │
   │ (sessão, prefer.) │          │  opcao + leitura    │       │  (leituras locais) │
   └──────────────────┘          └──────────────────────┘       └─────────────────────┘
   Capas: /covers/<file> ◀──────── GET /covers/:file
```