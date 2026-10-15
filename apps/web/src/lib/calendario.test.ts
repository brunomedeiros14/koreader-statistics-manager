import { describe, expect, it } from "bun:test";

import {
  chaveDiaLocal,
  intervaloUtcDoDia,
  minutosPorDiaLocal,
} from "./calendario";

// Monta o instante UTC correspondente a um relógio local (meses 0-based).
const isoLocal = (
  y: number,
  m: number,
  d: number,
  h: number,
  mi: number,
): string => new Date(y, m, d, h, mi).toISOString().replace(/\.\d{3}Z$/, "Z");

const total = (mapa: Map<string, number>): number =>
  [...mapa.values()].reduce((a, b) => a + b, 0);

describe("chaveDiaLocal", () => {
  it("usa o dia do relógio local", () => {
    expect(chaveDiaLocal(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("minutosPorDiaLocal", () => {
  it("conta uma sessão dentro do mesmo dia em um único dia", () => {
    const mapa = minutosPorDiaLocal([
      { data_hora_1: isoLocal(2026, 0, 10, 9, 0), data_hora_2: isoLocal(2026, 0, 10, 10, 30) },
    ]);
    expect(mapa.size).toBe(1);
    expect(total(mapa)).toBeCloseTo(90);
  });

  it("não joga a leitura da noite para o dia seguinte (fuso local)", () => {
    const mapa = minutosPorDiaLocal([
      { data_hora_1: isoLocal(2026, 0, 10, 21, 0), data_hora_2: isoLocal(2026, 0, 10, 22, 0) },
    ]);
    expect(mapa.get("2026-01-10")).toBeCloseTo(60);
    expect(mapa.get("2026-01-11")).toBeUndefined();
  });

  it("divide uma sessão que atravessa a meia-noite entre os dois dias", () => {
    const mapa = minutosPorDiaLocal([
      { data_hora_1: isoLocal(2026, 0, 15, 22, 0), data_hora_2: isoLocal(2026, 0, 16, 2, 0) },
    ]);
    expect(mapa.size).toBe(2);
    expect(mapa.get("2026-01-15")).toBeCloseTo(120);
    expect(mapa.get("2026-01-16")).toBeCloseTo(120);
    expect(total(mapa)).toBeCloseTo(240);
  });

  it("soma várias sessões no mesmo dia", () => {
    const mapa = minutosPorDiaLocal([
      { data_hora_1: isoLocal(2026, 5, 3, 8, 0), data_hora_2: isoLocal(2026, 5, 3, 8, 30) },
      { data_hora_1: isoLocal(2026, 5, 3, 20, 0), data_hora_2: isoLocal(2026, 5, 3, 21, 0) },
    ]);
    expect(mapa.size).toBe(1);
    expect(total(mapa)).toBeCloseTo(90);
  });

  it("ignora datas inválidas", () => {
    const mapa = minutosPorDiaLocal([
      { data_hora_1: "não é data", data_hora_2: "2026-01-10T10:00:00Z" },
    ]);
    expect(mapa.size).toBe(0);
  });
});

describe("intervaloUtcDoDia", () => {
  it("cobre o dia local inteiro", () => {
    const r = intervaloUtcDoDia("2026-01-15");
    expect(r).not.toBeNull();
    expect(new Date(r!.inicio).getHours()).toBe(0);
    expect(new Date(r!.fim).getHours()).toBe(23);
    expect(new Date(r!.inicio).getDate()).toBe(15);
    expect(new Date(r!.fim).getDate()).toBe(15);
  });

  it("rejeita datas malformadas", () => {
    expect(intervaloUtcDoDia("15/01/2026")).toBeNull();
    expect(intervaloUtcDoDia("2026-13-01")).toBeNull();
    expect(intervaloUtcDoDia("2026-02-30")).toBeNull();
    expect(intervaloUtcDoDia("")).toBeNull();
  });
});
