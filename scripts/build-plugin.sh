#!/bin/sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist/leitura_manual.zip"

rm -f "$OUT"
mkdir -p "$ROOT/dist"

cd "$ROOT/leitura_manual.koplugin"
zip -r "$OUT" . -x '.*'
cd "$ROOT"

echo "Pacote gerado: $OUT"