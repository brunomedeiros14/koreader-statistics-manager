# syntax=docker/dockerfile:1

FROM oven/bun:1-alpine AS base

WORKDIR /app

ENV NODE_ENV=production

# ------------------------------------------------------------
# Dependencies
# ------------------------------------------------------------

FROM base AS deps

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile --production


# ------------------------------------------------------------
# Runtime
# ------------------------------------------------------------

FROM base AS runner

ARG PORT=3000

ENV PORT=${PORT}

# Cria usuário/grupo explicitamente
RUN addgroup -S -g 1001 app \
    && adduser -S -D -u 1001 -G app app \
    && mkdir -p /app/data \
    && chown -R 1001:1001 /app

COPY --from=deps --chown=1001:1001 \
    /app/node_modules \
    ./node_modules

COPY --chown=1001:1001 \
    package.json bun.lock ./

COPY --chown=1001:1001 \
    src ./src

COPY --chown=1001:1001 \
    docker/entrypoint.sh \
    /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh

USER 1001:1001

EXPOSE 3000

VOLUME ["/app/data"]

HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=10s \
    --retries=3 \
    CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["bun", "src/server.ts"]