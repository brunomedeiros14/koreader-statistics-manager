import { describe, expect, it } from "bun:test";

import { coverSrc } from "./cover";

describe("coverSrc", () => {
  it("retorna null sem imagem", () => {
    expect(coverSrc(null)).toBeNull();
    expect(coverSrc(undefined)).toBeNull();
    expect(coverSrc("")).toBeNull();
  });
  it("mantém data: URIs", () => {
    expect(coverSrc("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });
  it("normaliza caminhos covers/ para a raiz", () => {
    expect(coverSrc("covers/abc.png")).toBe("/covers/abc.png");
    expect(coverSrc("/covers/abc.png")).toBe("/covers/abc.png");
  });
  it("trata base64 cru como PNG", () => {
    expect(coverSrc("QUFBQQ==")).toBe("data:image/png;base64,QUFBQQ==");
  });
});