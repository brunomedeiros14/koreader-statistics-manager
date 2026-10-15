# API HTTP

Servidor: Elysia em `apps/server/src/server.ts`. Base URL: `http://<host>:3000`.
Existe documentação OpenAPI interativa em `GET /openapi` (Swagger UI).

Convenções de resposta:

- Sucesso: JSON do recurso (variável por rota).
- Erro: normalmente `{ ok: false, error: string }` (mutações) ou `{ error: string }` (rotas GET).
  - `VALIDATION`/`PARSE` → `400`
  - rota não encontrada → `404`
  - erro de servidor → `500`

## Plugin

### `GET /api/plugin`
Manifesto do plugin disponível no servidor.
```json
{ "nome": "leitura_manual", "versao": "0.1.0" }
```
A versão é lida do `_meta.lua` (`leitura_manual.koplugin`).

### `GET /api/plugin/download`
Retorna o `.zip` do plugin (gerado por `scripts/build-plugin.sh` em `dist/leitura_manual.zip`).
`404` com texto se o pacote não foi compilado.

## Configuração

### `GET /api/opcoes`
Lista livros mapeados, ordenados por `posicao, id`.
```json
{ "livros": [ { "id": 1, "titulo": "...", "autor": "...", "imagem": "covers/...", "md5": "..." } ] }
```

### `GET /api/config`
Alias de leitura da configuração (mesma forma de `GET /api/opcoes`).

### `POST /api/config`
Substitui a **lista inteira** de livros (reativa com FK off; remapeia `leitura.opcao_id`).
```json
{ "livros": [ { "titulo": "...", "md5": "hex32", "autor": "?", "imagem": "?" } ] }
```
Resposta: `{ ok: true, livros: [...] }`. `imagem` pode ser base64/data-URI ou caminho `covers/...`.

### `POST /api/livro`
Sincroniza **um** livro — upsert idempotente por `md5`.
```json
{ "md5": "hex32", "titulo": "...", "autor": "?", "imagem": "base64|data-URI|covers/..." }
```
Resposta: `{ ok: true, id, novo: boolean }`.
Regras: `md5` 32-hex e título obrigatórios, senão `400`.

## Leitura — registros

### `GET /api/leitura`
Lista paginada com filtros.

Query params (todos opcionais):
| Param | Tipo | Descrição |
| --- | --- | --- |
| `page` | int ≥ 1 | Página (default 1). |
| `limit` | int ≥ 1 | Tamanho (default 100). |
| `opcao_id` | int | Filtra por livro. |
| `md5` | string | Filtra por `md5` do livro. |
| `sincronizada` | `0`/`1`/`2` | Estado da sincronização KOReader. |
| `data_inicio` | string | `data_hora_1 >=` valor. |
| `data_fim` | string | `data_hora_1 <=` valor. |

Resposta:
```json
{
  "total": 0, "page": 1, "limit": 100, "pages": 1,
  "registros": [
    {
      "id": 1, "tipo": null, "opcao_id": null, "op_id": null, "origem": "web",
      "data_hora_1": "2026-09-01T10:00", "data_hora_2": "2026-09-01T10:30",
      "numero_1": 1, "numero_2": 10, "numero_3": 100,
      "created_at": "...", "md5": null, "leitura_sincronizada": 0,
      "titulo": "Título (COALESCE(opcao.texto, leitura.tipo))"
    }
  ]
}
```

### `POST /api/leitura`
Registra uma leitura. **Idempotente via `op_id`**.
Payload: ver [SCHEMAS.md → Payloads](/docs/SCHEMAS.md#5-payloads-da-api-contrato-leituracommon--domaints).

- `op_id` repetido → `{ ok: true, id, duplicado: true }`.
- Validação falhou → `400 { ok: false, error }`.
- `UNIQUE(op_id)` violada em corrida → `409`.

### `PATCH /api/leitura?id=`
Edição parcial do registro. Body = qualquer subconjunto do payload do POST
(`t.Partial(bodyLeitura)`). Quando `md5` é enviado, o livro é resolvido de novo
(possível auto-cadastro se desconhecido). `leitura_sincronizada` aceita
`boolean | 0|1|2`.

### `DELETE /api/leitura?id=`
Exclui um registro. Resposta `{ ok: true, removidos: 0|1 }` (não distingue
"não existia").

### `GET /api/export.csv`
Exporta CSV (RFC 4180 + BOM UTF-8) com os mesmos filtros do GET `/api/leitura`
(exceto `page`/`limit`). Cabeçalho:
`id,titulo,md5,data_hora_1,data_hora_2,numero_1,numero_2,numero_3,created_at`.

## Estatísticas

### `GET /api/stats`
Agregados globais + séries. Aceita filtro opcional por intervalo de
`data_hora_1` (instantes UTC canônicos), usado pelo calendário para abrir o
recorte de um dia.

Query params (todos opcionais):
| Param | Tipo | Descrição |
| --- | --- | --- |
| `data_inicio` | string UTC | `data_hora_1 >=` valor. |
| `data_fim` | string UTC | `data_hora_1 <=` valor. |
```json
{
  "total": 0, "primeira_data": "", "ultima_data": "",
  "media_num1": 0, "media_num2": 0, "media_num3": 0,
  "soma_num1": 0, "soma_num2": 0, "soma_num3": 0,
  "duracao_media_horas": 0, "duracao_total_horas": 0, "paginas_lidas": 0,
  "por_tipo": [ { "opcao_id": null, "tipo": null, "n": 0, "horas": 0 } ],
  "por_dia":  [ { "dia": "2026-09-01", "n": 0, "horas": 0, "soma_num1": 0 } ],
  "por_mes":  [ { "mes": "2026-09", "n": 0, "horas": 0 } ]
}
```
`paginas_lidas` = `SUM(numero_2 - numero_1 + 1)` quando `numero_2 >= numero_1`.
Durações calculadas via `julianday` sobre as strings de data (naive, sem timezone).

## Capas e SPA

- `GET /covers/:file` — imagem de capa (`data/covers/`). Nome validação por regex;
  `400` se inválido, `404` se ausente.
- `GET /assets/*` — assets do build do frontend (pasta `dist/assets`).
- `GET /*` — arquivos estáticos do SPA e fallback para `index.html` (rotas client-side).
  Caminhos `/api/*` e `/openapi*` desconhecidos → `404`.

## Assinaturas de erro não mapeadas

Qualquer exceção não tratada cai em `onError` → `500 { ok: false, error: <message> }`
(a mensagem pode vazar detalhes internos; ver plano de melhorias — sanitização de erros).