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

# The embedder (onnxruntime-node, pulled in by @huggingface/transformers) gets
# bundled into dist/, but its native binary + shared lib live in node_modules.
# The bundled require resolves them at dist/../bin, so stage that dir next to the
# build output or the recommender silently falls back to structured-only.
RUN ORT_BIN="$(find /app -type d -path '*/onnxruntime-node/bin' | head -1)" \
	&& test -n "$ORT_BIN" \
	&& mkdir -p /app/apps/server/bin \
	&& cp -r "$ORT_BIN/." /app/apps/server/bin/

# ── Stage 3: Production dependencies ──────────────────────────────
# A runtime node_modules holding ONLY the server's production dependency tree.
# The `apps/web` manifest is intentionally omitted so the `apps/*` workspace glob
# never resolves it — that drops the entire frontend dep tree (fontsource, icon
# packs, base-ui, …) plus every devDependency from the runtime image. bun forces
# a frozen lockfile in --production mode and the trimmed workspace set no longer
# matches bun.lock, so this stage resolves fresh (versions still come from the
# committed manifests / catalog); the built code in `installer` remains the
# lockfile-pinned artifact.
FROM base AS proddeps

WORKDIR /app

COPY package.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/env/package.json packages/env/package.json

RUN bun install --production

# ── Stage 4: Calibre (upstream binary, GUI/WebEngine stripped) ────
# The distro `calibre` package hard-depends on the full Qt6 + WebEngine + PyQt6
# GUI stack (~1.4 GB). We only shell out to the `ebook-convert` CLI (AZW3→EPUB
# import and EPUB→EPUB re-pack), which runs headless, so we ship calibre's
# self-contained upstream binary instead and delete its bundled Qt WebEngine
# (~247 MB, unused for these formats). TARGETARCH is set by buildx (amd64|arm64).
FROM base AS calibre

ARG CALIBRE_VERSION=9.11.0
ARG TARGETARCH

RUN apk add --no-cache wget xz tar ca-certificates \
	&& case "$TARGETARCH" in \
		amd64) CALIBRE_ARCH=x86_64 ;; \
		arm64) CALIBRE_ARCH=arm64 ;; \
		*) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
	esac \
	&& mkdir -p /opt/calibre \
	&& wget -nv -O /tmp/calibre.txz "https://download.calibre-ebook.com/${CALIBRE_VERSION}/calibre-${CALIBRE_VERSION}-${CALIBRE_ARCH}.txz" \
	&& tar xf /tmp/calibre.txz -C /opt/calibre \
	&& rm /tmp/calibre.txz \
	&& find /opt/calibre \( -iname '*webengine*' -o -iname '*WebEngine*' \) -exec rm -rf {} + \
	&& rm -rf /opt/calibre/libexec/QtWebEngineProcess

# ── Stage 5: Production runner ────────────────────────────────────
FROM oven/bun:1.3.12-debian AS runner

# ffmpeg (audiobooks) + postgresql-client + wget (healthcheck), plus the minimal
# system libs the upstream calibre binary needs to run ebook-convert headless
# (libopengl0 is what QtGui/QColor needs for the MOBI/AZW3 image path).
RUN apt-get update && apt-get install -y --no-install-recommends \
		ffmpeg wget postgresql-client \
		libglib2.0-0 libgl1 libegl1 libopengl0 libxkbcommon0 \
		libfontconfig1 libfreetype6 libdbus-1-3 \
	&& rm -rf /var/lib/apt/lists/*

# Home dir must be writable so calibre can create its config + fontconfig cache
RUN groupadd --system nanahoshi \
	&& useradd --system --gid nanahoshi --create-home --home-dir /home/nanahoshi nanahoshi

# Headless calibre binary (see calibre stage); ebook-convert resolves via PATH
COPY --from=calibre /opt/calibre /opt/calibre

WORKDIR /app/apps/server

# Copy built server output
COPY --from=installer /app/apps/server/dist ./dist

# Native onnxruntime binary for the embedder (see installer stage). Sits at
# dist/../bin so the bundled require("../bin/napi-v6/...") resolves at runtime.
COPY --from=installer /app/apps/server/bin ./bin

# Copy the production-only node_modules (no web/dev deps — see proddeps stage)
COPY --from=proddeps /app/node_modules /app/node_modules
COPY --from=proddeps /app/apps/server/node_modules ./node_modules

# Copy package.json files for bun to resolve
COPY --from=installer /app/package.json /app/package.json
COPY --from=installer /app/apps/server/package.json ./package.json

# Copy Drizzle migrations (SQL files applied at startup)
COPY --from=installer /app/packages/db/src/migrations /app/apps/server/dist/migrations

# Create data directory for covers/tmp and converted ebooks
RUN mkdir -p /app/apps/server/data/converted && chown -R nanahoshi:nanahoshi /app/apps/server/data

USER nanahoshi

ENV ENVIRONMENT=production \
	HOME=/home/nanahoshi \
	PATH="/opt/calibre:${PATH}" \
	QT_QPA_PLATFORM=offscreen
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["bun", "run", "dist/index.mjs"]
