# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.3.12

FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /app

FROM base AS manifests
COPY bun.lock package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/api/package.json packages/api/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/ebook-parser/package.json packages/ebook-parser/
COPY packages/env/package.json packages/env/

FROM base AS build
COPY --from=manifests /app ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile

COPY apps/web/ apps/web/
COPY packages/ packages/

# Baked into the client bundle; kept below the install to not bust its cache
ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=${VITE_SERVER_URL}

WORKDIR /app/apps/web
RUN bun run build

# Keep the runtime dependency tree identical to the one used to compile the
# SSR bundle. A fresh install without bun.lock can resolve newer packages than
# the build stage (notably TanStack Start/Router), and mixing those versions
# can turn redirects into empty 200 responses.
FROM base AS proddeps
COPY --from=manifests /app ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --production --frozen-lockfile

FROM base AS runner

RUN addgroup -S nanahoshi && adduser -S nanahoshi -G nanahoshi

WORKDIR /app/apps/web

COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/apps/web/server.ts ./server.ts
COPY --from=build /app/apps/web/package.json ./package.json
COPY --from=build /app/apps/web/scripts/verify-production-ssr.ts ./scripts/verify-production-ssr.ts
COPY --from=proddeps /app/node_modules /app/node_modules
COPY --from=proddeps /app/apps/web/node_modules ./node_modules

# Exercise the built handler with the exact dependencies shipped in this
# image. The auth request is mocked so this remains deterministic and offline.
RUN bun run scripts/verify-production-ssr.ts

USER nanahoshi

ENV ENVIRONMENT=production \
	PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["bun", "run", "start"]
