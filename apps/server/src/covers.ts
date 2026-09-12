import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

import { DATA_DIR } from "./db";

export const COVERS_DIR = join(DATA_DIR, "covers");

const BASE64_RE = /^[A-Za-z0-9+/=\r\n]+$/;
const PATH_RE = /^covers\/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/;

// Persists a cover image sent as base64/data-URI to <data>/covers and returns
// the relative path to store in the DB. A value that is already a relative
// path (covers/...) is returned unchanged; anything else resolves to "".
export const resolveCover = (imagem: unknown, md5: string): string => {
  const raw = typeof imagem === "string" ? imagem.trim() : "";
  if (!raw) return "";
  if (raw.startsWith("/")) return raw.replace(/^\//, "");
  if (PATH_RE.test(raw)) return raw;

  let mime = "image/png";
  let payload = raw;
  if (raw.startsWith("data:image/")) {
    const m = raw.match(/^data:image\/(png|jpe?g|webp);base64,([\s\S]+)$/i);
    if (!m) return "";
    const tipo = (m[1] ?? "").toLowerCase();
    if (!tipo) return "";
    mime = `image/${tipo === "jpg" ? "jpeg" : tipo}`;
    payload = m[2] ?? "";
  } else if (!BASE64_RE.test(raw)) {
    return "";
  }

  const buf = Buffer.from(payload.replace(/[\r\n]/g, ""), "base64");
  if (buf.length === 0) return "";

  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
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