# ── Stage 1: Bun base ──────────────────────────────────────────────
FROM oven/bun:1.3.12-alpine AS base

# ── Stage 2: Install deps & build server ──────────────────────────
FROM base AS installer

WORKDIR /app

# Copy lockfile and all package.json files first for layer caching
COPY bun.lock package.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/env/package.json packages/env/package.json

RUN bun install --frozen-lockfile

# Copy source code
COPY apps/server/ apps/server/
COPY packages/ packages/

# Build the server (tsdown bundles @nanahoshi-v2/* via noExternal)
WORKDIR /app/apps/server
RUN bun run build

# ── Stage 3: Production runner ────────────────────────────────────
FROM oven/bun:1.3.12-debian AS runner

RUN apt-get update && apt-get install -y --no-install-recommends calibre wget postgresql-client && rm -rf /var/lib/apt/lists/*

RUN groupadd --system nanahoshi && useradd --system --gid nanahoshi nanahoshi

WORKDIR /app/apps/server

# Copy built server output
COPY --from=installer /app/apps/server/dist ./dist

# Copy node_modules (only third-party deps needed at runtime)
COPY --from=installer /app/node_modules /app/node_modules
COPY --from=installer /app/apps/server/node_modules ./node_modules

# Copy package.json files for bun to resolve
COPY --from=installer /app/package.json /app/package.json
COPY --from=installer /app/apps/server/package.json ./package.json

# Copy Drizzle migrations (SQL files applied at startup)
COPY --from=installer /app/packages/db/src/migrations /app/apps/server/dist/migrations

# Create data directory for covers/tmp and converted ebooks
RUN mkdir -p /app/apps/server/data/converted && chown -R nanahoshi:nanahoshi /app/apps/server/data

USER nanahoshi

ENV ENVIRONMENT=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["bun", "run", "dist/index.mjs"]
