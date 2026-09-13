# Nanahoshi

A modern, fast, self-hosted, multi-tenant digital library server for managing books and audiobooks. Set up your own and share your collection.

<img width="2560" height="1290" alt="image" src="https://github.com/user-attachments/assets/5906821d-bd13-4e7f-b56a-b2e6e441b02a" />

## Installation with Docker

1. Create a folder:

   ```sh
   mkdir nanahoshi && cd nanahoshi
   ```

2. Inside create `docker-compose.yml` with this content:

   ```yml
   name: nanahoshi-v2

   services:
     server:
       stop_grace_period: 40s
       image: ghcr.io/natsume-197/nanahoshi:latest
       restart: unless-stopped
       env_file: .env
       ports: ["3000:3000"]
       volumes:
         - server_data:/app/apps/server/data
         - ./books:/books:ro
       depends_on:
         postgres: { condition: service_healthy }
         redis: { condition: service_healthy }

     postgres:
       image: groonga/pgroonga:4.0.8-alpine-18
       restart: unless-stopped
       shm_size: 256mb
       command: ["postgres", "-c", "shared_buffers=256MB", "-c", "jit=off"]
       environment:
         POSTGRES_DB: ${DB_NAME:-nanahoshi-v2}
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
   ```

3. Save [`.env.example`](.env.example) as `.env`, fill in your URL and required secrets, then start:

   ```sh
   docker compose up -d
   ```

Open your configured URL (default `http://localhost:3000`), create your account and add a library.

## Local development

Requirements: Bun 1.4.0, Docker and Docker Compose.

```bash
cp .env.example apps/server/.env
# Fill every REQUIRED value in apps/server/.env and set:
# ENVIRONMENT=development, DB_HOST=127.0.0.1, REDIS_HOST=127.0.0.1
# CORS_ORIGIN=http://localhost:3001
bun install --frozen-lockfile
bun run infra:up
bun run db:migrate
VITE_SERVER_URL=http://localhost:3000 bun run dev
```

The web application is available at `http://localhost:3001` and the API at
`http://localhost:3000` with the example defaults. The first account created on
a fresh installation becomes the instance administrator.

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
