import { describe, expect, it } from "bun:test";

import {
  agoraUtc,
  isValidDataHora,
  isValidIso,
  isValidIsoUtc,
  isValidMd5,
  isValidNumero,
  isValidSyncStatus,
  normalizarUtc,
  toNumber,
} from "./index";

describe("toNumber", () => {
  it("usa o fallback para valores vazios", () => {
    expect(toNumber(null, 42)).toBe(42);
    expect(toNumber("", 42)).toBe(42);
  });
  it("converte números válidos", () => {
    expect(toNumber("7", 42)).toBe(7);
    expect(toNumber(" 3.5 ", 42)).toBe(3.5);
  });
  it("usa o fallback para valores não numéricos", () => {
    expect(toNumber("abc", 42)).toBe(42);
  });
});

describe("isValidIso", () => {
  it("aceita datas bem formadas", () => {
    expect(isValidIso("2026-09-18T10:30")).toBe(true);
    expect(isValidIso("2024-02-29T23:59")).toBe(true);
  });
  it("rejeita datas impossíveis", () => {
    expect(isValidIso("2026-13-10T10:00")).toBe(false);
    expect(isValidIso("2026-02-30T10:00")).toBe(false);
    expect(isValidIso("2023-02-29T10:00")).toBe(false);
    expect(isValidIso("2026-04-31T10:00")).toBe(false);
  });
  it("rejeita horários inválidos e formatos fora do padrão", () => {
    expect(isValidIso("2026-09-18T24:00")).toBe(false);
    expect(isValidIso("2026-09-18T10:60")).toBe(false);
    expect(isValidIso("2026-09-18 10:00")).toBe(false);
    expect(isValidIso("2026-9-18T10:00")).toBe(false);
    expect(isValidIso(123)).toBe(false);
    expect(isValidIso(null)).toBe(false);
  });
});

describe("isValidMd5", () => {
  it("aceita 32 caracteres hex", () => {
    expect(isValidMd5("a".repeat(32))).toBe(true);
    expect(isValidMd5("013F".repeat(8).toLowerCase())).toBe(true);
  });
  it("rejeita tamanhos e caracteres inválidos", () => {
    expect(isValidMd5("a".repeat(31))).toBe(false);
    expect(isValidMd5("z".repeat(32))).toBe(false);
    expect(isValidMd5("")).toBe(false);
    expect(isValidMd5(undefined)).toBe(false);
  });
});

describe("isValidNumero", () => {
  it("aceita inteiros >= 0", () => {
    expect(isValidNumero(0)).toBe(true);
    expect(isValidNumero(42)).toBe(true);
  });
  it("rejeita decimais, negativos e não números", () => {
    expect(isValidNumero(1.5)).toBe(false);
    expect(isValidNumero(-1)).toBe(false);
    expect(isValidNumero("3")).toBe(false);
  });
});

describe("isValidSyncStatus", () => {
  it("aceita booleanos e 0/1/2", () => {
    expect(isValidSyncStatus(true)).toBe(true);
    expect(isValidSyncStatus(false)).toBe(true);
    expect(isValidSyncStatus(0)).toBe(true);
    expect(isValidSyncStatus(1)).toBe(true);
    expect(isValidSyncStatus(2)).toBe(true);
  });
  it("rejeita valores fora da faixa", () => {
    expect(isValidSyncStatus(3)).toBe(false);
    expect(isValidSyncStatus(-1)).toBe(false);
    expect(isValidSyncStatus("1")).toBe(false);
  });
});

describe("isValidIsoUtc", () => {
  it("aceita o formato canônico UTC (YYYY-MM-DDTHH:MM:SSZ)", () => {
    expect(isValidIsoUtc("2026-09-18T10:30:00Z")).toBe(true);
    expect(isValidIsoUtc("2024-02-29T23:59:59Z")).toBe(true);
  });
  it("rejeita datas impossíveis e formatos fora do padrão", () => {
    expect(isValidIsoUtc("2026-02-30T10:00:00Z")).toBe(false);
    expect(isValidIsoUtc("2026-09-18T24:00:00Z")).toBe(false);
    expect(isValidIsoUtc("2026-09-18T10:60:00Z")).toBe(false);
    expect(isValidIsoUtc("2026-09-18T10:30")).toBe(false);
    expect(isValidIsoUtc("2026-09-18T10:30:00")).toBe(false);
    expect(isValidIsoUtc("2026-09-18T10:30:00+00:00")).toBe(false);
    expect(isValidIsoUtc(123)).toBe(false);
  });
});

describe("isValidDataHora", () => {
  it("aceita o formato legado e o canônico", () => {
    expect(isValidDataHora("2026-09-18T10:30")).toBe(true);
    expect(isValidDataHora("2026-09-18T10:30:00Z")).toBe(true);
  });
  it("rejeita outros formatos", () => {
    expect(isValidDataHora("2026-09-18 10:30")).toBe(false);
    expect(isValidDataHora("2026-09-18T10:30:00")).toBe(false);
    expect(isValidDataHora("")).toBe(false);
  });
});

describe("normalizarUtc", () => {
  it("converte o formato legado para canônico (UTC, sem deslocamento)", () => {
    expect(normalizarUtc("2026-09-18T10:30")).toBe("2026-09-18T10:30:00Z");
    expect(normalizarUtc("2024-02-29T23:59")).toBe("2024-02-29T23:59:00Z");
  });
  it("mantém o formato canônico inalterado", () => {
    expect(normalizarUtc("2026-09-18T10:30:00Z")).toBe("2026-09-18T10:30:00Z");
  });
  it("rejeita valores inválidos", () => {
    expect(normalizarUtc("2026-02-30T10:30")).toBe(null);
    expect(normalizarUtc("2026-09-18")).toBe(null);
    expect(normalizarUtc(123)).toBe(null);
    expect(normalizarUtc(null)).toBe(null);
  });
  it("preserva a ordenação lexicográfica do canônico", () => {
    const a = normalizarUtc("2026-09-18T10:30") as string;
    const b = normalizarUtc("2026-09-18T10:31:00Z") as string;
    expect(a < b).toBe(true);
  });
});

describe("agoraUtc", () => {
  it("retorna o instante atual no formato canônico", () => {
    expect(agoraUtc()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});