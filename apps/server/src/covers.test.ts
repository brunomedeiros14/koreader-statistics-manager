import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.COVERS_DIR = mkdtempSync(join(tmpdir(), "leitura-covers-"));

const { COVERS_DIR, MAX_COVER_BYTES, dimensoesImagem, resolveCover } = await import("./covers");

const png = (w: number, h: number): Uint8Array =>
  new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    (w >>> 24) & 0xff, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff,
    (h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff,
    0x08, 0x02, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);

const jpeg = (w: number, h: number): Uint8Array =>
  new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (h >>> 8) & 0xff, h & 0xff,
    (w >>> 8) & 0xff, w & 0xff,
    0x01, 0x01, 0x01, 0x00,
  ]);

const webp = (w: number, h: number): Uint8Array =>
  new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20, 0x9d, 0x01, 0x2a,
    w & 0xff, (w >>> 8) & 0x3f,
    h & 0xff, (h >>> 8) & 0x3f,
  ]);

const b64 = (b: Uint8Array): string => Buffer.from(b).toString("base64");

describe("dimensoesImagem", () => {
  it("lê PNG a partir do IHDR", () => {
    expect(dimensoesImagem(png(256, 128))).toEqual({ width: 256, height: 128 });
  });
  it("lê JPEG a partir do marcador SOF", () => {
    expect(dimensoesImagem(jpeg(300, 200))).toEqual({ width: 300, height: 200 });
  });
  it("lê WebP VP8", () => {
    expect(dimensoesImagem(webp(100, 100))).toEqual({ width: 100, height: 100 });
  });
  it("rejeita conteúdo que não é imagem", () => {
    expect(dimensoesImagem(new Uint8Array(64))).toBeNull();
    expect(dimensoesImagem(Buffer.from("não é imagem"))).toBeNull();
  });
  it("rejeita buffer curto demais", () => {
    expect(dimensoesImagem(new Uint8Array(8))).toBeNull();
  });
});

describe("resolveCover", () => {
  const md5 = "a".repeat(32);

  it("grava PNG via data-URI e devolve o caminho relativo", () => {
    const img = `data:image/png;base64,${b64(png(100, 100))}`;
    const path = resolveCover(img, md5);
    expect(path).toBe(`covers/${md5}.png`);
    expect(existsSync(join(COVERS_DIR, `${md5}.png`))).toBe(true);
  });

  it("aceita base64 sem prefixo (tipo deduzido do cabeçalho)", () => {
    const path = resolveCover(b64(jpeg(100, 100)), md5);
    expect(path).toBe(`covers/${md5}.jpg`);
  });

  it("aceita caminho relativo já válido (não reescreve)", () => {
    expect(resolveCover(`covers/${md5}.webp`, md5)).toBe(`covers/${md5}.webp`);
  });

  it("rejeita data-URI com prefixo errado ou MIME inválido", () => {
    expect(resolveCover(`data:text/plain;base64,${b64(png(1, 1))}`, md5)).toBe("");
    expect(resolveCover("data:image/png;base64,x", md5)).toBe("");
  });

  it("rejeita base64 mal formada", () => {
    expect(resolveCover("!!!não-base64!!!", md5)).toBe("");
    expect(resolveCover(b64(png(1, 1)).slice(0, -2), md5)).toBe("");
  });

  it("rejeita imagem maior que o limite de dimensão", () => {
    const big = `data:image/png;base64,${b64(png(5000, 100))}`;
    expect(resolveCover(big, md5)).toBe("");
  });

  it("rejeita imagem acima do limite de tamanho (bytes)", () => {
    const oversized = new Uint8Array(MAX_COVER_BYTES + 1);
    oversized.set(png(100, 100));
    expect(resolveCover(b64(oversized), md5)).toBe("");
  });

  it("rejeita string vazia e não-string", () => {
    expect(resolveCover("", md5)).toBe("");
    expect(resolveCover(null, md5)).toBe("");
  });
});