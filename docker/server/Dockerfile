# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.3.14
ARG CALIBRE_VERSION=9.11.0
ARG HONOMIYA_REF=7208c57b8a31b8da364a6739bce8d9bc8e324839

# ── Dependency manifests ─────────────────────────────────────────────
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
COPY packages/read-listen/package.json packages/read-listen/

# ── Application build ────────────────────────────────────────────────
FROM base AS build
COPY --from=manifests /app ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
COPY apps/server/ apps/server/
COPY packages/ packages/
WORKDIR /app/apps/server
RUN bun run build \
	&& ORT_BIN="$(find /app -type d -path '*/onnxruntime-node/bin' | head -1)" \
	&& test -n "$ORT_BIN" \
	&& mkdir -p bin \
	&& cp -r "$ORT_BIN/." bin/

# ── Production dependencies ─────────────────────────────────────────
FROM base AS production-deps
COPY --from=manifests /app ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	rm -rf apps/web bun.lock \
	&& bun install --production

FROM production-deps AS api-deps
RUN rm -rf \
	/app/node_modules/.bun/@huggingface+* \
	/app/node_modules/.bun/onnxruntime-* \
	/app/node_modules/.bun/node_modules/@huggingface \
	/app/node_modules/.bun/node_modules/onnxruntime-*

# ── Honomiya CLI ─────────────────────────────────────────────────────
FROM base AS honomiya
ARG HONOMIYA_REF
RUN apk add --no-cache git
RUN mkdir -p /src/Honomiya \
	&& git -C /src/Honomiya init \
	&& git -C /src/Honomiya fetch --depth=1 \
		https://github.com/Natsume-197/Honomiya.git "${HONOMIYA_REF}" \
	&& git -C /src/Honomiya checkout --detach FETCH_HEAD \
	&& test "$(git -C /src/Honomiya rev-parse HEAD)" = "${HONOMIYA_REF}"
WORKDIR /src/Honomiya
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile \
	&& bun run build \
	&& bun ./dist/cli.js --version

# ── Worker toolchain ─────────────────────────────────────────────────
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

# ── Shared runtime ───────────────────────────────────────────────────
FROM oven/bun:${BUN_VERSION}-debian AS runtime
RUN groupadd --system nanahoshi \
	&& useradd --system --gid nanahoshi --create-home --home-dir /home/nanahoshi nanahoshi
WORKDIR /app/apps/server
RUN mkdir -p data/converted \
	&& chown -R nanahoshi:nanahoshi /app/apps/server /home/nanahoshi
ENV ENVIRONMENT=production \
	HOME=/home/nanahoshi \
	HONOMIYA_CLI_PATH=/opt/honomiya/cli.js

# ── Worker image ─────────────────────────────────────────────────────
FROM runtime AS worker
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ffmpeg postgresql-client \
		libglib2.0-0 libgl1 libegl1 libopengl0 libxkbcommon0 \
		libfontconfig1 libfreetype6 libdbus-1-3 \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/apps/server/package.json ./package.json
COPY --from=build /app/packages/db/src/migrations ./dist/migrations
COPY --from=production-deps /app/node_modules /app/node_modules
COPY --from=production-deps /app/apps/server/node_modules ./node_modules
RUN ln -s /app/node_modules/.bun/node_modules/@embedpdf /app/node_modules/@embedpdf
COPY --from=calibre /opt/calibre /opt/calibre
COPY --from=build /app/apps/server/bin ./bin
COPY --from=honomiya --chown=nanahoshi:nanahoshi /src/Honomiya/dist/cli.js /opt/honomiya/cli.js
ENV PATH="/opt/calibre:${PATH}" QT_QPA_PLATFORM=offscreen PROCESS_ROLE=worker
USER nanahoshi
CMD ["bun", "run", "dist/worker.mjs"]

# ── API image (default target) ───────────────────────────────────────
FROM runtime AS api
RUN apt-get update \
	&& apt-get install -y --no-install-recommends postgresql-client \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/apps/server/package.json ./package.json
COPY --from=build /app/packages/db/src/migrations ./dist/migrations
COPY --from=api-deps /app/node_modules /app/node_modules
COPY --from=api-deps /app/apps/server/node_modules ./node_modules
RUN ln -s /app/node_modules/.bun/node_modules/@embedpdf /app/node_modules/@embedpdf
COPY --from=honomiya --chown=nanahoshi:nanahoshi /src/Honomiya/dist/cli.js /opt/honomiya/cli.js
USER nanahoshi
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD ["bun", "-e", "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bun", "run", "dist/index.mjs"]
