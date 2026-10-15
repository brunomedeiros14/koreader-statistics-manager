# Schemas de dados

Existem **três bancos SQLite** e **dois storage de cliente** envolvidos:

| Onde | Banco/Storage | Papel |
| --- | --- | --- |
| Servidor | `data/leitura.sqlite3` | Catálogo (`opcao`) e histórico (`leitura`). |
| Plugin (KOReader) | `settings/leitura_outbox.sqlite3` | Cache de registros + fila de envio. |
| KOReader (nativo) | `settings/statistics.sqlite3` | Estatísticas de leitura do KOReader (book + page_stat_data). |
| Navegador | `localStorage` | Sessão de leitura ativa e preferência da estante. |

---

## 1. `data/leitura.sqlite3` (servidor)

Schema Drizzle em `apps/server/src/db/schema/{sqlite,pg}.ts` (fonte de verdade) e
tipos de domínio em `libs/common/src/domain.ts`. As migrations são geradas por
**drizzle-kit** em `apps/server/drizzle/{sqlite,pg}/` e aplicadas em runtime pelo
migrator do drizzle-orm.

### Tabela `opcao` — livro mapeado

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `texto` | TEXT NOT NULL | Título do livro (no Drizzle é a property `titulo`). Nome legado. |
| `posicao` | INTEGER NOT NULL DEFAULT 0 | Ordenação na estante; reescrita em `POST /api/config`. |
| `md5` | TEXT (UNIQUE via `idx_opcao_md5`) | Chave de idempotência do livro. `NULL` permitido (legado). |
| `autor` | TEXT NOT NULL DEFAULT '' | |
| `imagem` | TEXT NOT NULL DEFAULT '' | Caminho relativo `covers/<md5>.<ext>` ou string vazia. |

- O índice único `idx_opcao_md5` é declarado no schema Drizzle e no baseline gerado.
- Um md5 vazio/inválido é descartado no `POST /api/config`.

### Tabela `leitura` — registro de leitura

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `tipo` | TEXT | Título no momento do registro (denormalizado). |
| `opcao_id` | INTEGER REFERENCES `opcao(id)` | Livro associado (`NULL` possível). |
| `op_id` | TEXT (UNIQUE via `idx_leitura_op_id`) | Chave de idempotência do envio (gerado no cliente). `NULL` em registros legados. |
| `origem` | TEXT NOT NULL DEFAULT 'web' | `'web'` ou `'plugin'`. |
| `data_hora_1` | TEXT NOT NULL | Início, formato `YYYY-MM-DDTHH:MM` (naive, sem timezone). |
| `data_hora_2` | TEXT NOT NULL | Término, mesmo formato; deve ser > `data_hora_1`. |
| `numero_1` | INTEGER NOT NULL | Página inicial. |
| `numero_2` | INTEGER NOT NULL | Página final (≥ `numero_1`). |
| `numero_3` | INTEGER NOT NULL | Total de páginas do livro físico (≥ 1). |
| `created_at` | TEXT NOT NULL DEFAULT `datetime('now')` | Carimbo de criação (UTC, via SQLite). |
| `md5` | TEXT | Denormalização do `md5` do livro (facilita filtros sem join). |
| `leitura_sincronizada` | INTEGER NOT NULL DEFAULT 0 | `0` = em espera, `1` = sincronizada, `2` = pulada. |

Índices: `idx_leitura_op_id` (único), `idx_leitura_opcao_id`, `idx_leitura_data_hora_1`.

### Tabela `campo` — (legado, **sem uso atual**)

| Coluna | Tipo |
| --- | --- |
| `id` | INTEGER PK AUTOINCREMENT |
| `rotulo` | TEXT NOT NULL |
| `posicao` | INTEGER NOT NULL DEFAULT 0 |
| `habilitado` | INTEGER NOT NULL DEFAULT 1 |

Candidate a remoção — não é referenciada por nenhum fluxo.

### Relacionamento

```
opcao 1 ──── 0..n leitura
               (leitura.opcao_id → opcao.id)
```

`leitura.tipo` e `opcao.texto` convivem: `tipo` guarda o título tal como veio no registro;
consulta/UI usa `COALESCE(o.texto, l.tipo)`.

## 2. `leitura_outbox.sqlite3` (plugin — cache + fila)

Localização: `DataStorage:getSettingsDir() .. "/leitura_outbox.sqlite3"`.
Criado por `leitura_outbox.openDb()`.

### Tabela `cache_registros` — espelho local dos registros

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `op_id` | TEXT PRIMARY KEY | Mesma chave de idempotência usada no servidor. |
| `payload` | TEXT NOT NULL | JSON do registro (campos do POST `/api/leitura`). |
| `created_at` | INTEGER NOT NULL | Unix timestamp local (segundos). |
| `synced` | INTEGER NOT NULL DEFAULT 0 | `1` quando o servidor confirmou. |

Registros vindos do servidor em `pullFromServer()` usam `op_id` do servidor
(preferido) ou fallback `server:<row.id>`.

### Tabela `outbox` — fila de envio

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `payload` | TEXT NOT NULL | JSON do payload. |
| `created_at` | INTEGER NOT NULL | Unix timestamp. |
| `status` | TEXT NOT NULL DEFAULT 'pending' | `pending` / `done` / `failed`. |

- `pending` → tenta reenvio (idempotente via `op_id`).
- `done` → enviado com sucesso ao servidor.
- `failed` → rejeitado por validação no servidor (não retenta).

**Inconsistência conhecida**: `cache_registros.synced` marca confirmado, mas
`cache_registros.payload.id` (id do servidor) só é gravado quando `flush()` atualiza
o payload com `result.id`.

## 3. `statistics.sqlite3` (KOReader nativo — somente leitura/inserção pelo plugin)

Schema do KOReader (o plugin só lê `book` e escreve em `page_stat_data`).

### Tabela `book`

| Coluna | Tipo |
| --- | --- |
| `id` | INTEGER PK AUTOINCREMENT |
| `title` | TEXT |
| `authors` | TEXT |
| `notes` / `highlights` | INTEGER |
| `last_open` | INTEGER (unix) |
| `pages` | INTEGER |
| `series` / `language` | TEXT |
| `md5` | TEXT |
| `total_read_time` / `total_read_pages` | INTEGER |

Índice único: `book_title_authors_md5 (title, authors, md5)`.

### Tabela `page_stat_data` — registro por página lida

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id_book` | INTEGER REFERENCES `book(id)` | |
| `page` | INTEGER NOT NULL DEFAULT 0 | Página de referência do KOReader. |
| `start_time` | INTEGER NOT NULL DEFAULT 0 | Unix (segundos) — início da leitura da página. |
| `duration` | INTEGER NOT NULL DEFAULT 0 | Segundos nessa página. |
| `total_pages` | INTEGER NOT NULL DEFAULT 0 | Total considerado no momento. |

`UNIQUE (id_book, page, start_time)` — é isso que torna a injeção **idempotente**:
uma mesma leitura reexecutada gera os mesmos pares `(page, start_time)` e o
`INSERT OR IGNORE` não duplica.

### View `page_stat`

View do próprio KOReader que "estica" cada registro de página para o esquema de
páginas do livro (rescale). O plugin não escreve nela diretamente.

---

## 4. `localStorage` (navegador)

| Chave | Conteúdo | Usada em |
| --- | --- | --- |
| `leitura-manual.sessao.ativa` | JSON `{ livroId, md5, titulo, paginaInicial, inicio, criadoEm }` | `sessao.ts` |
| `leitura-manual.preferencias.estante` | `"tabela"` ou `"imagem"` | `preferencias.ts` |

A sessão é **transient**: sobrevive a refresh, mas é descartada ao finalizar/descartar.

---

## 5. Payloads da API (contrato `@leitura/common` → `domain.ts`)

### `POST /api/leitura`
```ts
{
  op_id?: string;          // idempotência; gerado pelo cliente
  md5: string;             // 32 hex (obrigatório)
  titulo?: string;         // usado no auto-cadastro do livro
  origem?: string;         // 'web' | 'plugin'
  data_hora_1: string;     // YYYY-MM-DDTHH:MM
  data_hora_2: string;     // YYYY-MM-DDTHH:MM ( > data_hora_1 )
  numero_1: number;        // inteiro >= 0
  numero_2: number;        // inteiro >= 0, >= numero_1
  numero_3: number;        // inteiro >= 1
  leitura_sincronizada?: boolean | 0|1|2;
}
```

### `PATCH /api/leitura?id=`
Mesmos campos, todos opcionais (`t.Partial(bodyLeitura)`).

### `POST /api/config` e `POST /api/livro`
```ts
// config: substitui a lista inteira
{ livros?: Array<{ titulo: string; md5: string; autor?: string; imagem?: string }> }
// livro: upsert idempotente via md5
{ md5: string; titulo: string; autor?: string; imagem?: string }  // imagem: base64 ou caminho covers/
```

### Resposta de estatísticas (`GET /api/stats`)
```ts
{
  total, primeira_data, ultima_data,
  media_num1..3, soma_num1..3,
  duracao_media_horas, duracao_total_horas, paginas_lidas,
  por_tipo: [{ opcao_id, tipo, n, horas }],
  por_dia:  [{ dia, n, horas, soma_num1 }],
  por_mes:  [{ mes, n, horas }],
}
```

---

## Regras de validação (server, `validation.ts`)

1. `md5` obrigatório e no formato `^[0-9a-fA-F]{32}$`.
2. Datas em `YYYY-MM-DDTHH:MM` e `data_hora_2 > data_hora_1`.
3. Números inteiros `>= 0`; `numero_2 >= numero_1`; `numero_3 >= 1`.
4. Livro resolvido por `md5`; se desconhecido, **auto-cadastrado** com `titulo`
   (erro se o título vier vazio).
5. `leitura_sincronizada` aceita booleano ou inteiro `0..2`.