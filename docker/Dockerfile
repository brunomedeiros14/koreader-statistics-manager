# syntax=docker/dockerfile:1

# Estágio base compartilhado (imagem oficial do Bun, Alpine = imagem pequena)
FROM oven/bun:1-alpine AS base
WORKDIR /app

# --- Build do frontend (@leitura/web) ----------------------------------------
# O bun instala as dependências de cada workspace em apps/*/node_modules
# (apontando para o virtual store em node_modules/.bun), então devemos copiar a
# fonte ANTES do bun install — caso contrário o `COPY apps ./apps` apaga esses
# node_modules e o `vite build` falha com "command not found" (exit 127).
FROM base AS build-stage
COPY package.json bun.lock tsconfig.base.json ./
COPY apps ./apps
COPY libs ./libs
RUN bun install --frozen-lockfile
RUN bun run --filter @leitura/web build

# --- Runtime ------------------------------------------------------------------
FROM base AS runner
ARG PORT=3000
ENV PORT=$PORT

# su-exec: entrypoint roda como root para chown do volume e então cai para app
RUN apk add --no-cache su-exec \
  && addgroup -S app \
  && adduser -S -G app app \
  && mkdir -p /app/data \
  && chown -R app:app /app

# Imagem só com o essencial: node_modules + server + common (TS roda nativo) +
# o SPA compilado em apps/web/dist.
COPY --from=build-stage --chown=app:app /app/node_modules ./node_modules
COPY --from=build-stage --chown=app:app /app/package.json /app/bun.lock ./
COPY --from=build-stage --chown=app:app /app/apps/server ./apps/server
COPY --from=build-stage --chown=app:app /app/libs ./libs
COPY --from=build-stage --chown=app:app /app/apps/web/dist ./apps/web/dist
COPY --chown=app:app docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
EXPOSE 3000
VOLUME /app/data

# Healthcheck sem dependências externas (usa o próprio Bun)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["bun", "apps/server/src/server.ts"]