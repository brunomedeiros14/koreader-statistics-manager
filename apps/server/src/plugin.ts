import { existsSync, readFileSync } from "fs";
import { join } from "path";

// Pick an existing path among candidates: bun's import.meta.dir resolution
// varies between launches, so depend on existence rather than `..` depth.
const firstExisting = (candidates: string[]): string | null => {
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
};

const PLUGIN_DIR =
  process.env.LEITURA_PLUGIN_DIR ??
  firstExisting([
    join(import.meta.dir, "../../../leitura_manual.koplugin"),
    join(import.meta.dir, "../../../../leitura_manual.koplugin"),
  ]) ??
  join(import.meta.dir, "../../../leitura_manual.koplugin");

const PLUGIN_ZIP =
  process.env.LEITURA_PLUGIN_ZIP ??
  firstExisting([
    join(import.meta.dir, "../../../dist/leitura_manual.zip"),
    join(import.meta.dir, "../../../../dist/leitura_manual.zip"),
  ]) ??
  join(import.meta.dir, "../../../dist/leitura_manual.zip");

const readVersion = (): string => {
  try {
    const src = readFileSync(join(PLUGIN_DIR, "_meta.lua"), "utf8");
    const m = src.match(/version\s*=\s*["']([^"']+)["']/);
    return m && m[1] ? m[1] : "0.0.0";
  } catch {
    return "0.0.0";
  }
};

export const pluginManifest = (): { nome: string; versao: string } => ({
  nome: "leitura_manual",
  versao: readVersion(),
});

export const pluginDownload = (): Response => {
  if (!existsSync(PLUGIN_ZIP)) {
    return new Response(
      "Pacote do plugin ainda não compilado — rode scripts/build-plugin.sh.",
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(Bun.file(PLUGIN_ZIP), {
    headers: { "Content-Type": "application/zip" },
  });
};