import { beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { LeituraMutacao } from "./leitura.service";

// Isolated DB per run: the db config is read at import time, so set it first.
process.env.DB_SQLITE_PATH = join(
  mkdtempSync(join(tmpdir(), "leitura-test-")),
  "leitura.sqlite3",
);

const { repo } = await import("../db");
const { criarLeitura, editarLeitura, excluirLeitura, listarLeitura } =
  await import("./leitura.service");
const { upsertLivro } = await import("./livros.service");

type OkLeitura = Extract<LeituraMutacao, { ok: true }>;
type ErrLeitura = Extract<LeituraMutacao, { ok: false }>;

const MD5 = "0feedeadbeefcafe0feedeadbeefcafe";
const OP_ID = "op-1";

const payload = {
  op_id: OP_ID,
  md5: MD5,
  titulo: "Livro Teste",
  origem: "web",
  data_hora_1: "2026-09-01T10:00",
  data_hora_2: "2026-09-01T11:00",
  numero_1: 1,
  numero_2: 20,
  numero_3: 300,
};

const contar = (): Promise<number> => repo.contarLeitura({});

describe("criarLeitura", () => {
  it("registra e cria o livro referenciado (auto-cadastro)", async () => {
    const res = await criarLeitura(payload, "web");
    expect(res.ok).toBe(true);
    if (res.ok) expect(typeof res.id).toBe("number");
    const livros = await upsertLivro({ md5: "aaaa".repeat(8), titulo: "Auto" });
    expect(livros.ok).toBe(true);
  });

  it("replay com o mesmo op_id retorna duplicado e não insere", async () => {
    const antes = await contar();
    const res = await criarLeitura(payload, "plugin");
    expect((res as OkLeitura).duplicado).toBe(true);
    expect(await contar()).toBe(antes);
  });

  it("replay é idempotente mesmo com conteúdo diferente", async () => {
    const antes = await contar();
    const res = await criarLeitura({ ...payload, titulo: "Outro" }, "web");
    expect((res as OkLeitura).duplicado).toBe(true);
    expect(await contar()).toBe(antes);
  });

  it("rejeita data impossível", async () => {
    const res = await criarLeitura(
      { ...payload, op_id: "op-bad", data_hora_1: "2026-02-30T10:00" },
      "web",
    );
    expect(res.ok).toBe(false);
  });

  it("rejeita página final antes da inicial", async () => {
    const res = await criarLeitura(
      { ...payload, op_id: "op-bad2", numero_1: 10, numero_2: 5 },
      "web",
    );
    expect(res.ok).toBe(false);
  });
});

describe("listarLeitura", () => {
  it("filtra por md5", async () => {
    const res = await listarLeitura({ md5: MD5, limit: "10", page: "1" });
    expect(res.total).toBe(3);
    expect(res.registros[0]?.titulo).toBe("Livro Teste");
  });
  it("filtro por md5 desconhecido retorna vazio", async () => {
    const res = await listarLeitura({ md5: "dead".repeat(8), limit: "10" });
    expect(res.total).toBe(0);
  });
});

describe("editarLeitura", () => {
  let id: number;
  beforeAll(async () => {
    const res = await criarLeitura(payload, "web");
    id = (res as OkLeitura).id!;
  });

  it("404 para id inexistente", async () => {
    const res = await editarLeitura(99999, { numero_2: 30 });
    expect((res as ErrLeitura).status).toBe(404);
  });

  it("valida contra os valores atuais (página final < inicial)", async () => {
    const res = await editarLeitura(id, { numero_2: 0 });
    expect(res.ok).toBe(false);
  });

  it("valida datas contra os valores atuais", async () => {
    const res = await editarLeitura(id, { data_hora_2: "2026-09-01T09:00" });
    expect(res.ok).toBe(false);
  });

  it("mantém md5/tipo/opcao_id consistentes ao trocar o livro (F.2)", async () => {
    const outroMd5 = "beefcafe0feedeadbeefcafe0feedead";
    await upsertLivro({ md5: outroMd5, titulo: "Livro B" });
    const res = await editarLeitura(id, { md5: outroMd5, titulo: "Livro B" });
    expect(res.ok).toBe(true);
    const row = await repo.buscarLeituraPorId(id);
    expect(row?.md5).toBe(outroMd5);
    expect(row?.tipo).toBe("Livro B");
    expect(row?.opcaoId).not.toBeNull();
  });

  it("reset sincronizada=1 ao editar conteúdo (F.1)", async () => {
    const res = await editarLeitura(id, { leitura_sincronizada: 1 });
    expect(res.ok).toBe(true);
    const r1 = await repo.buscarLeituraPorId(id);
    expect(r1?.leituraSincronizada).toBe(1);

    const res2 = await editarLeitura(id, { numero_2: 25 });
    expect(res2.ok).toBe(true);
    const r2 = await repo.buscarLeituraPorId(id);
    expect(r2?.leituraSincronizada).toBe(0);
  });

  it("não reseta sincronizada quando só muda opcao_id", async () => {
    const res = await editarLeitura(id, { leitura_sincronizada: 1 });
    expect(res.ok).toBe(true);
    const res2 = await editarLeitura(id, { titulo: "Livro Teste" });
    expect(res2.ok).toBe(true);
    const r = await repo.buscarLeituraPorId(id);
    expect(r?.leituraSincronizada).toBe(1);
  });
});

describe("excluirLeitura", () => {
  it("404 para id inexistente", async () => {
    const res = await excluirLeitura(99999);
    expect((res as ErrLeitura).status).toBe(404);
  });
  it("exclui registro existente", async () => {
    const criado = (await criarLeitura(
      { ...payload, op_id: "op-del", titulo: "Para excluir" },
      "web",
    )) as OkLeitura;
    const res = await excluirLeitura(criado.id!);
    expect(res.ok).toBe(true);
  });
});

describe("timestamps UTC (A.1/C.3)", () => {
  it("grava data_hora no formato canônico UTC", async () => {
    const criado = (await criarLeitura(
      { ...payload, op_id: "op-utc" },
      "web",
    )) as OkLeitura;
    expect(criado.ok).toBe(true);
    const row = await repo.buscarLeituraPorId(criado.id!);
    expect(row?.dataHora1).toBe("2026-09-01T10:00:00Z");
    expect(row?.dataHora2).toBe("2026-09-01T11:00:00Z");
  });

  it("aceita data_hora já no formato canônico", async () => {
    const criado = (await criarLeitura(
      {
        ...payload,
        op_id: "op-utc2",
        data_hora_1: "2026-09-02T10:00:00Z",
        data_hora_2: "2026-09-02T11:00:00Z",
      },
      "web",
    )) as OkLeitura;
    expect(criado.ok).toBe(true);
    const row = await repo.buscarLeituraPorId(criado.id!);
    expect(row?.dataHora1).toBe("2026-09-02T10:00:00Z");
  });

  it("rejeita instante (formato sem Z)", async () => {
    const res = await criarLeitura(
      {
        ...payload,
        op_id: "op-utc3",
        data_hora_1: "2026-09-01T10:00:00",
        data_hora_2: "2026-09-01T11:00:00",
      },
      "web",
    );
    expect(res.ok).toBe(false);
  });

  it("preenche updated_at ao criar e só mexe em edição de conteúdo (E.2)", async () => {
    const criado = (await criarLeitura(
      { ...payload, op_id: "op-e2" },
      "web",
    )) as OkLeitura;
    const r1 = await repo.buscarLeituraPorId(criado.id!);
    expect(r1?.updatedAt).not.toBeNull();

    const antes = r1?.updatedAt;
    await editarLeitura(criado.id!, { titulo: "Renomear" });
    const r2 = await repo.buscarLeituraPorId(criado.id!);
    expect(r2?.updatedAt).toBe(antes);

    await Bun.sleep(1100);
    await editarLeitura(criado.id!, { numero_2: 21 });
    const r3 = await repo.buscarLeituraPorId(criado.id!);
    expect(r3?.updatedAt).not.toBe(antes);
  });
});
