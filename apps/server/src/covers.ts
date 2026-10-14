import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

import { DATA_PADRAO } from "./db/config";

// Capas vivem no filesystem (nos dois drivers), configuráveis por COVERS_DIR.
export const COVERS_DIR =
  process.env.COVERS_DIR?.trim() || join(DATA_PADRAO, "covers");

// B.3: limites de upload de capa (espelho do limite do plugin no KOReader).
export const MAX_COVER_BYTES = 8 * 1024 * 1024; // 8 MB decodificados
export const MAX_COVER_DIM = 4096; // pixels no maior lado

// Base64 estrita: alfabeto padrão + até dois '=' de padding no fim, com a
// string podendo conter quebras de linha (o plugin envia com \n a cada ~76).
const BASE64_STRICT_RE = /^[A-Za-z0-9+/]*(?:={0,2})$/;
const PATH_RE = /^covers\/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/;
export const COVER_FILE_RE = /^[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/;

// Leitura segura de dimensões a partir do cabeçalho (sem decodificar a imagem
// inteira): PNG (IHDR), JPEG (marcadores SOF) e WebP (VP8/VP8L/VP8X).
export const dimensoesImagem = (
  buf: Uint8Array,
): { width: number; height: number } | null => {
  if (buf.length < 12) return null;
  const b = (i: number): number => buf[i] ?? 0;

  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) {
    // PNG: "IHDR" aos bytes 8–11; width/height big-endian aos 16–23.
    if (b(12) !== 0x49 || b(13) !== 0x48 || b(14) !== 0x44 || b(15) !== 0x52) return null;
    return {
      width: (b(16) << 24) | (b(17) << 16) | (b(18) << 8) | b(19),
      height: (b(20) << 24) | (b(21) << 16) | (b(22) << 8) | b(23),
    };
  }

  if (b(0) === 0xff && b(1) === 0xd8) {
    // JPEG: percorre marcadores até achar um SOF0–SOF15.
    for (let i = 2; i + 9 < buf.length; ) {
      if (b(i) !== 0xff) break;
      const marker = b(i + 1);
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2; // marcador sem payload
        continue;
      }
      const len = (b(i + 2) << 8) | b(i + 3);
      if (len < 2 || i + 2 + len > buf.length) break;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return {
          height: (b(i + 5) << 8) | b(i + 6),
          width: (b(i + 7) << 8) | b(i + 8),
        };
      }
      i += 2 + len;
    }
    return null;
  }

  if (
    b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 &&
    b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50
  ) {
    const chunk = String.fromCharCode(b(12), b(13), b(14), b(15));
    if (chunk === "VP8X") {
      // 24-bit "(width-1)" / "(height-1)" little-endian aos bytes 24–29.
      return {
        width: (b(24) | (b(25) << 8) | ((b(26) & 0x0f) << 16)) + 1,
        height: (b(27) | (b(28) << 8) | ((b(29) & 0x0f) << 16)) + 1,
      };
    }
    if (chunk === "VP8 ") {
      // Frame tag de 3 bytes (16–18); largura/altura little-endian 14-bit.
      return {
        width: ((b(20) & 0x3f) << 8) | b(19),
        height: ((b(22) & 0x3f) << 8) | b(21),
      };
    }
    if (chunk === "VP8L") {
      // Lossless: 14-bit width/height (1-based) little-endian em 4 bytes.
      const w = 1 + (((b(22) & 0x3f) << 8) | b(21));
      const h = 1 + (((b(24) & 0x0f) << 8) | (b(23) << 2) | ((b(22) & 0xc0) >> 6));
      return { width: w, height: h };
    }
    return null;
  }

  return null;
};

const base64ParaBuffer = (payload: string): Uint8Array | null => {
  const s = payload.replace(/[\r\n]/g, "");
  if (s.length % 4 !== 0) return null;
  if (!BASE64_STRICT_RE.test(s)) return null;
  const body = s.replace(/=+$/, "");
  const expectedPad = body.length % 4 === 0 ? 0 : 4 - (body.length % 4);
  const pad = s.length - body.length;
  if (pad > 2 || pad !== expectedPad) return null;
  const buf = Buffer.from(s, "base64");
  if (buf.length === 0) return null;
  return new Uint8Array(buf);
};

// Persists a cover image sent as base64/data-URI to <data>/covers and returns
// the relative path to store in the DB. A value that is already a relative
// path (covers/...) is returned unchanged; anything else resolves to "".
export const resolveCover = (imagem: unknown, md5: string): string => {
  const raw = typeof imagem === "string" ? imagem.trim() : "";
  if (!raw) return "";
  if (PATH_RE.test(raw)) return raw;
  if (raw.startsWith("/covers/") && PATH_RE.test(raw.slice(1))) {
    return raw.slice(1); // caminho absoluto legado "covers/..."
  }

  let mime: string | undefined;
  let payload = raw;
  if (raw.startsWith("data:image/")) {
    // Prefixo estrito: nada além de data:image/(png|jpe?g|webp);base64,.
    const m = raw.match(/^data:image\/(png|jpe?g|webp);base64,([\s\S]*)$/i);
    if (!m) return "";
    const tipo = (m[1] ?? "").toLowerCase();
    mime = `image/${tipo === "jpg" ? "jpeg" : tipo}`;
    payload = m[2] ?? "";
  } else if (/^data:/i.test(raw)) {
    return ""; // data-URI de outro tipo (ex.: text/plain) — rejeitar
  }
  // Sem prefixo: base64 pura — o tipo real é deduzido do cabeçalho.

  const buf = base64ParaBuffer(payload);
  if (!buf) return "";
  if (buf.length > MAX_COVER_BYTES) return "";

  let tipo = mime ? mime.replace("image/", "") : "";
  if (!tipo) {
    if (buf[0] === 0x89) tipo = "png";
    else if (buf[0] === 0xff) tipo = "jpeg";
    else if (buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
      tipo = "webp";
    else return "";
  }

  if (tipo !== "png" && tipo !== "jpeg" && tipo !== "webp") return "";

  const dim = dimensoesImagem(buf);
  if (!dim || dim.width <= 0 || dim.height <= 0) return "";
  if (dim.width > MAX_COVER_DIM || dim.height > MAX_COVER_DIM) return "";

  const ext = tipo === "jpeg" ? "jpg" : tipo === "webp" ? "webp" : "png";
  mkdirSync(COVERS_DIR, { recursive: true });
  const file = `${md5}.${ext}`;
  writeFileSync(join(COVERS_DIR, file), buf);
  return `covers/${file}`;
};

// Removes cover files no longer referenced by any book row.
export const limparCapasOrfas = (referenciadas: Array<string>): void => {
  if (!existsSync(COVERS_DIR)) return;
  const refs = new Set(
    referenciadas.filter((i) => PATH_RE.test(i)),
  );
  for (const f of readdirSync(COVERS_DIR)) {
    if (f === ".DS_Store") continue;
    if (!refs.has(`covers/${f}`)) {
      try {
        rmSync(join(COVERS_DIR, f));
      } catch {
        // ignore individual failures
      }
    }
  }
};