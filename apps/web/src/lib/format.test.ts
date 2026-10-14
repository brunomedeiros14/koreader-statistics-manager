import { describe, expect, it } from "bun:test";

import {
  fmtDec,
  fmtDuracao,
  fmtInt,
  fmtLocal,
  fmtTempo,
  isoLocal,
  minutosEntre,
} from "./format";

describe("fmtDuracao", () => {
  it("formata minutos em h/min", () => {
    expect(fmtDuracao(45)).toBe("45min");
    expect(fmtDuracao(120)).toBe("2h");
    expect(fmtDuracao(200)).toBe("3h20min");
    expect(fmtDuracao(0)).toBe("0min");
  });
  it("arredonda e não fica negativo", () => {
    expect(fmtDuracao(59.9)).toBe("1h");
    expect(fmtDuracao(-5)).toBe("0min");
  });
});

describe("fmtTempo", () => {
  it("formata HH:MM:SS", () => {
    expect(fmtTempo(0)).toBe("00:00:00");
    expect(fmtTempo(45_000)).toBe("00:00:45");
    expect(fmtTempo(3_660_000)).toBe("01:01:00");
  });
});

describe("isoLocal", () => {
  it("converte para o formato datetime-local", () => {
    expect(isoLocal("2026-09-18T10:30:00")).toBe("2026-09-18T10:30");
  });
});

describe("fmtLocal", () => {
  it("retorna o valor original quando não é data válida", () => {
    expect(fmtLocal("abc")).toBe("abc");
  });
});

describe("minutosEntre", () => {
  it("calcula diferença positiva em minutos", () => {
    expect(minutosEntre("2026-09-01T10:00", "2026-09-01T11:30")).toBe(90);
    expect(minutosEntre("2026-09-01T12:00", "2026-09-01T11:00")).toBe(0);
  });
});

describe("fmtDec / fmtInt", () => {
  it("usa o locale pt-BR", () => {
    expect(fmtDec(1234.5)).toBe("1.234,50");
    expect(fmtInt(4123456)).toBe("4.123.456");
  });
});