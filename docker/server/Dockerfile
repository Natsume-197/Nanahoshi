# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.3.12
ARG CALIBRE_VERSION=9.11.0

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
COPY packages/env/package.json packages/env/

FROM base AS build
COPY --from=manifests /app ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile

COPY apps/server/ apps/server/
COPY packages/ packages/

WORKDIR /app/apps/server
RUN bun run build

# The bundle resolves onnxruntime-node's native binaries at dist/../bin;
# without them the recommender silently falls back to structured-only.
RUN ORT_BIN="$(find /app -type d -path '*/onnxruntime-node/bin' | head -1)" \
	&& test -n "$ORT_BIN" \
	&& mkdir -p bin \
	&& cp -r "$ORT_BIN/." bin/

# Runtime node_modules without apps/web (drops the frontend dep tree).
# The trimmed workspace no longer matches bun.lock, so this resolves fresh.
FROM base AS proddeps
COPY --from=manifests /app ./
RUN rm -rf apps/web bun.lock
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --production

# Upstream calibre binary instead of the distro package (~1.4 GB of Qt GUI
# deps); only the headless ebook-convert CLI is used, so WebEngine goes too.
FROM base AS calibre
ARG CALIBRE_VERSION
ARG TARGETARCH

RUN <<'EOF'
set -e
apk add --no-cache wget xz tar ca-certificates
case "$TARGETARCH" in
	amd64) CALIBRE_ARCH=x86_64 ;;
	arm64) CALIBRE_ARCH=arm64 ;;
	*) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;;
esac
mkdir -p /opt/calibre
wget -nv -O /tmp/calibre.txz \
	"https://download.calibre-ebook.com/${CALIBRE_VERSION}/calibre-${CALIBRE_VERSION}-${CALIBRE_ARCH}.txz"
tar xf /tmp/calibre.txz -C /opt/calibre
rm /tmp/calibre.txz
find /opt/calibre -iname '*webengine*' -exec rm -rf {} +
EOF

FROM oven/bun:${BUN_VERSION}-debian AS runner

# libopengl0 is what QtGui needs for the MOBI/AZW3 image path
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ffmpeg wget postgresql-client \
		libglib2.0-0 libgl1 libegl1 libopengl0 libxkbcommon0 \
		libfontconfig1 libfreetype6 libdbus-1-3 \
	&& rm -rf /var/lib/apt/lists/*

# Home dir must be writable for calibre's config + fontconfig cache
RUN groupadd --system nanahoshi \
	&& useradd --system --gid nanahoshi --create-home --home-dir /home/nanahoshi nanahoshi

COPY --from=calibre /opt/calibre /opt/calibre

WORKDIR /app/apps/server

COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/bin ./bin
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/apps/server/package.json ./package.json
COPY --from=build /app/packages/db/src/migrations ./dist/migrations
COPY --from=proddeps /app/node_modules /app/node_modules
COPY --from=proddeps /app/apps/server/node_modules ./node_modules

RUN mkdir -p data/converted && chown -R nanahoshi:nanahoshi data

USER nanahoshi

ENV ENVIRONMENT=production \
	HOME=/home/nanahoshi \
	PATH="/opt/calibre:${PATH}" \
	QT_QPA_PLATFORM=offscreen

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["bun", "run", "dist/index.mjs"]
