# Nanahoshi

A modern, fast, self-hosted, multi-tenant digital library server for managing books and audiobooks. Set up your own and share your collection.

<img width="2560" height="1290" alt="image" src="https://github.com/user-attachments/assets/5906821d-bd13-4e7f-b56a-b2e6e441b02a" />

## Installation with Docker

1. Create a folder:

   ```sh
   mkdir -p nanahoshi/books && cd nanahoshi
   ```

2. Inside create `docker-compose.yml` with this content:

   ```yml
   name: nanahoshi

   services:
     server:
       stop_grace_period: 40s
       image: ghcr.io/natsume-197/nanahoshi:latest
       restart: unless-stopped
       env_file: .env
       environment:
         PUID: ${PUID:-1000}
         PGID: ${PGID:-1000}
       ports: ["${APP_PORT:-7331}:3000"]
       volumes:
         - server_data:/app/apps/server/data
         - ./books:/books
         - updater:/var/lib/nanahoshi-updater
       depends_on:
         postgres: { condition: service_healthy }
         redis: { condition: service_healthy }

     # Installs new releases from Settings › Updates. Optional: see "Updates" below.
     updater:
       image: ghcr.io/natsume-197/nanahoshi:latest
       restart: unless-stopped
       entrypoint: ["bun", "/app/apps/server/dist/updater.mjs"]
       environment:
         PUID: ${PUID:-1000}
         PGID: ${PGID:-1000}
       volumes:
         - /var/run/docker.sock:/var/run/docker.sock
         - updater:/var/lib/nanahoshi-updater

     postgres:
       image: groonga/pgroonga:4.0.8-alpine-18
       restart: unless-stopped
       shm_size: 256mb
       command: ["postgres", "-c", "shared_buffers=256MB", "-c", "jit=off"]
       environment:
         POSTGRES_DB: ${DB_NAME:-nanahoshi}
         POSTGRES_USER: ${DB_USER:-postgres}
         POSTGRES_PASSWORD: ${DB_PASSWORD:?Set DB_PASSWORD in .env}
       volumes: ["postgres_data:/var/lib/postgresql"]
       healthcheck:
         test: ["CMD-SHELL", 'pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"']
         interval: 5s
         timeout: 5s
         retries: 5

     redis:
       image: redis:8.10.1-alpine
       restart: unless-stopped
       command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD:?Set REDIS_PASSWORD in .env}"]
       environment:
         REDIS_PASSWORD: "${REDIS_PASSWORD:?Set REDIS_PASSWORD in .env}"
       volumes: ["redis_data:/data"]
       healthcheck:
         test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
         interval: 5s
         timeout: 3s
         retries: 5

   volumes:
     postgres_data:
     server_data:
     redis_data:
     updater:
   ```

3. Save [`.env.example`](.env.example) as `.env`, fill in your URL and required
   secrets, and set `PUID` and `PGID` when their defaults do not match the owner
   of your books folder. Then start:

   ```sh
   docker compose up -d
   ```

Open your configured URL (default `http://localhost:7331`). A short setup names your
library and creates the administrator account, then asks where your books are: the
`books` folder mounted above is suggested, and Nanahoshi shows what it found before
importing. To use the phone app, scan the code under Settings → Mobile app.

## Updates

Nanahoshi checks GitHub for new releases once an hour, and administrators see a
notice when one is out. Settings → Updates shows the release notes and offers:

- **Update now**: restarts Nanahoshi on the new release right away, for about a minute.
- **Update when idle**: waits until no scan, audiobook stream or backup has run for
  5 minutes. Everyone signed in sees the planned restart, and an administrator can
  cancel it.
- **Download updates automatically** (on by default) and **Install updates
  automatically** (off by default).

The `updater` service does the work. It is the only container with the Docker
socket: the server never gets it, and only asks the updater, through a shared
folder, to pull the image tag the server already runs and to recreate that one
container with the same settings, volumes and networks. If the new release can't
start, or its backup fails before any change, the updater puts the previous
container back.

Every update is safe to take:

- Before a release changes the database, the server takes a `pg_dump` backup into
  `data/backups` (it also shows under Settings → Data & Backups). If the backup
  fails, nothing changes. `NANAHOSHI_PRE_UPDATE_BACKUP=false` skips it.
- Nanahoshi never moves back: an older release refuses a database a newer one
  migrated.
- A server that can't start shows a page saying why, instead of restarting over
  and over, and tries again by itself an hour later.

Without the `updater` service, update by hand:

```sh
docker compose pull && docker compose up -d
```

To stay on one release, use an exact tag such as `ghcr.io/natsume-197/nanahoshi:v1.5.0`;
the app then offers no update. `NANAHOSHI_UPDATE_CHECK=false` turns the release check off.

## Local development

Requirements: Bun 1.4.2, Docker and Docker Compose.

```bash
cp .env.example apps/server/.env
# Fill every REQUIRED value in apps/server/.env and set:
# ENVIRONMENT=development, DB_HOST=127.0.0.1, REDIS_HOST=127.0.0.1
# CORS_ORIGIN=http://nanahoshi-dev.localhost:7332, PORT=7333
# SERVER_URL=http://nanahoshi-dev.localhost:7333
# BETTER_AUTH_URL=http://nanahoshi-dev.localhost:7333
# DB_PORT=55432, REDIS_PORT=56379
bun install --frozen-lockfile
bun run infra:up
bun run db:migrate
VITE_SERVER_URL=http://nanahoshi-dev.localhost:7333 bun run dev
```

The web application is available at `http://nanahoshi-dev.localhost:7332` and the API at
`http://nanahoshi-dev.localhost:7333` with the development settings above. A fresh installation opens
the setup at `/setup`; the account created there becomes the instance administrator.

## Contribution and attribution

<table>
    <tr>
        <td align="center">
            <a href="https://github.com/Natsume-197">
                <img src="https://avatars.githubusercontent.com/u/36428207?v=4" width="100;" alt="Natsume-197"/>
                <br />
                <sub><b>Natsume-197</b></sub>
            </a>
        </td>
    </tr>
</table>
