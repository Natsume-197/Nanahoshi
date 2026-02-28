# ── Stage 1: Bun base ──────────────────────────────────────────────
FROM oven/bun:1.3.1-alpine AS base

# ── Stage 2: Install deps & build web app ─────────────────────────
FROM base AS installer

WORKDIR /app

# Build-time env var baked into client bundle
ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=${VITE_SERVER_URL}

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
COPY apps/web/ apps/web/
COPY packages/ packages/

# Build the web app (TanStack Start + Nitro bun preset)
WORKDIR /app/apps/web
RUN bun run build

# ── Stage 3: Production runner ────────────────────────────────────
FROM base AS runner

RUN addgroup -S nanahoshi && adduser -S nanahoshi -G nanahoshi

WORKDIR /app/apps/web

# Copy the Nitro build output (server + public assets)
COPY --from=installer /app/apps/web/.output ./.output

USER nanahoshi

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["bun", "run", ".output/server/index.mjs"]
