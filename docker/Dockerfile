# syntax=docker/dockerfile:1

# Estágio base compartilhado (imagem oficial do Bun, Alpine = imagem pequena)
FROM oven/bun:1-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# --- Dependências (estágio descartável: mantém cache/source fora da imagem) --
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# --- Runtime -----------------------------------------------------------------
FROM base AS runner
ARG PORT=3000
ENV PORT=$PORT

# su-exec: entrypoint roda como root para chown do volume e então cai para app
RUN apk add --no-cache su-exec \
  && addgroup -S app \
  && adduser -S -G app app \
  && mkdir -p /app/data \
  && chown -R app:app /app

# Imagem só com o essencial: node_modules de produção + src (TS roda nativo no Bun)
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json bun.lock ./
COPY --chown=app:app src ./src
COPY --chown=app:app docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
EXPOSE 3000
VOLUME /app/data

# Healthcheck sem dependências externas (usa o próprio Bun)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["bun", "src/server.ts"]