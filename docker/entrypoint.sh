#!/bin/sh
set -e
# O volume montado pode pertencer a outro uid (ex.: root quando criado via
# sudo). Ajusta o dono para o usuário da aplicação antes de subir o bun.
chown -R app:app /app/data
exec su-exec app "$@"