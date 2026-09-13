# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.4.0
ARG CALIBRE_VERSION=9.13.0
ARG HONOMIYA_REF=101b68b792152958eb28639cc5d5ff7254042fb9
ARG S6_OVERLAY_VERSION=3.2.3.2

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

# ── Shared build dependencies ────────────────────────────────────────
FROM manifests AS build-deps
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

# ── API and worker build ──────────────────────────────────────────────
FROM build-deps AS server-build
COPY apps/server/ apps/server/
COPY packages/ packages/
WORKDIR /app/apps/server
RUN bun run build \
	&& ORT_BIN="$(find /app -type d -path '*/onnxruntime-node/bin' | head -1)" \
	&& test -n "$ORT_BIN" \
	&& mkdir -p bin \
	&& cp -r "$ORT_BIN/." bin/

# ── Frontend build (SSR + static assets) ───────────────────────────────
FROM build-deps AS web-build
COPY apps/web/ apps/web/
COPY packages/ packages/
WORKDIR /app/apps/web
# An empty override makes the published browser bundle use its own origin.
# Public browser ingestion key, not a personal or project secret API key.
ARG PUBLIC_POSTHOG_KEY=""
ARG VITE_POSTHOG_HOST=""
ENV VITE_SERVER_URL="" \
	VITE_POSTHOG_HOST=${VITE_POSTHOG_HOST}
RUN VITE_POSTHOG_PROJECT_TOKEN="$PUBLIC_POSTHOG_KEY" bun run build

# ── Production dependencies ─────────────────────────────────────────
FROM manifests AS production-deps
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --production --frozen-lockfile

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

# ── Process supervisor ──────────────────────────────────────────────
FROM base AS s6
ARG S6_OVERLAY_VERSION
ARG TARGETARCH
RUN apk add --no-cache curl xz
RUN <<'EOF'
set -eu
case "$TARGETARCH" in
	amd64) S6_ARCH=x86_64 ;;
	arm64) S6_ARCH=aarch64 ;;
	*) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;;
esac
mkdir /overlay
cd /tmp
for archive in s6-overlay-noarch.tar.xz "s6-overlay-${S6_ARCH}.tar.xz"; do
	curl --fail --location --retry 3 -O "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/${archive}"
	curl --fail --location --retry 3 -O "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/${archive}.sha256"
	sha256sum -c "${archive}.sha256"
	tar -C /overlay -Jxpf "$archive"
done
EOF

# ── Application image (web, API and worker) ───────────────────────────
FROM oven/bun:${BUN_VERSION}-debian AS app
LABEL org.opencontainers.image.source="https://github.com/Natsume-197/Nanahoshi"
# PostgreSQL 18 matches the compose database. See https://www.postgresql.org/download/linux/debian/
RUN apt-get update \
	&& apt-get install -y --no-install-recommends curl ca-certificates \
	&& install -d /usr/share/postgresql-common/pgdg \
	&& curl --fail -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
	&& . /etc/os-release \
	&& echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends postgresql-client-18 \
	&& rm -rf /var/lib/apt/lists/*
RUN groupadd --system nanahoshi \
	&& useradd --system --gid nanahoshi --create-home --home-dir /home/nanahoshi nanahoshi
WORKDIR /app/apps/server
RUN mkdir -p data/converted \
	&& chown -R nanahoshi:nanahoshi /app/apps/server /home/nanahoshi
ENV ENVIRONMENT=production \
	HOME=/home/nanahoshi \
	HONOMIYA_CLI_PATH=/opt/honomiya/cli.js

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ffmpeg \
		libglib2.0-0 libgl1 libegl1 libopengl0 libxkbcommon0 \
		libfontconfig1 libfreetype6 libdbus-1-3 \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=server-build /app/apps/server/dist ./dist
COPY --from=server-build /app/package.json /app/package.json
COPY --from=server-build /app/apps/server/package.json ./package.json
COPY --from=server-build /app/packages/db/src/migrations ./dist/migrations
COPY --from=production-deps /app/node_modules /app/node_modules
COPY --from=production-deps /app/apps/server/node_modules ./node_modules
RUN ln -s /app/node_modules/.bun/node_modules/@embedpdf /app/node_modules/@embedpdf
COPY --from=calibre /opt/calibre /opt/calibre
COPY --from=server-build /app/apps/server/bin ./bin
COPY --from=honomiya --chown=nanahoshi:nanahoshi /src/Honomiya/dist/cli.js /opt/honomiya/cli.js
ENV PATH="/opt/calibre:${PATH}" QT_QPA_PLATFORM=offscreen
COPY --from=web-build /app/apps/web/dist /app/apps/web/dist
COPY --from=web-build /app/apps/web/server.ts /app/apps/web/server.ts
COPY --from=web-build /app/apps/web/package.json /app/apps/web/package.json
COPY --from=web-build /app/apps/web/scripts/verify-production-ssr.ts /app/apps/web/scripts/verify-production-ssr.ts
COPY --from=production-deps /app/apps/web/node_modules /app/apps/web/node_modules
RUN cd /app/apps/web && bun run scripts/verify-production-ssr.ts
ENV WEB_APP_PATH=/app/apps/web INTERNAL_API_URL=http://127.0.0.1:3000
COPY --from=s6 /overlay/ /
COPY --chmod=755 docker/s6/api-run /etc/services.d/api/run
COPY --chmod=755 docker/s6/worker-run /etc/services.d/worker/run
COPY --chmod=755 docker/s6/finish /etc/services.d/api/finish
COPY --chmod=755 docker/s6/finish /etc/services.d/worker/finish
COPY --chmod=755 docker/s6/healthcheck /usr/local/bin/nanahoshi-healthcheck
RUN chown nanahoshi:nanahoshi /run
ENV S6_BEHAVIOUR_IF_STAGE2_FAILS=2 S6_SERVICES_GRACETIME=30000
USER nanahoshi
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD ["/usr/local/bin/nanahoshi-healthcheck"]
ENTRYPOINT ["/init"]
CMD []
