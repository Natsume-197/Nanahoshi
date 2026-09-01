# Nanahoshi

A modern, fast, self-hosted, multi-tenant digital library server for managing books and audiobooks. Set up your own and share your collection.

<img width="2560" height="1290" alt="image" src="https://github.com/user-attachments/assets/5906821d-bd13-4e7f-b56a-b2e6e441b02a" />

## Local setup

Requirements: Bun 1.4.0, Docker and Docker Compose.

```bash
cp .env.example apps/server/.env
# Fill every REQUIRED value in apps/server/.env
bun install --frozen-lockfile
bun run infra:up
bun run db:migrate
bun run dev
```

The web application is available at `http://localhost:3001` and the API at
`http://localhost:3000` with the example defaults. The first account created on
a fresh installation becomes the instance administrator. Later registrations
require an invitation according to the configured policy.

Before upgrading, create and verify a backup with `bun run backup`.

### Integration tests

`bun run test:integration` runs five database and queue suites against real
PostgreSQL/PGroonga and Redis services. The suites mutate their configured
database and queues, so only point them at disposable test containers—never a
personal or production database.

For example, start fresh containers and run the suite with test-only settings:

```bash
docker run --rm -d --name nanahoshi-it-postgres -p 5432:5432 \
  -e POSTGRES_PASSWORD=integration-only-password \
  -e POSTGRES_DB=nanahoshi_integration groonga/pgroonga:4.0.8-alpine-18
docker run --rm -d --name nanahoshi-it-redis -p 6379:6379 redis:8.10.1-alpine

DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=postgres \
DB_PASSWORD=integration-only-password DB_NAME=nanahoshi_integration \
REDIS_HOST=127.0.0.1 REDIS_PORT=6379 \
CORS_ORIGIN=http://localhost:3001 SERVER_URL=http://localhost:3000 \
NAMESPACE_UUID=6ba7b810-9dad-11d1-80b4-00c04fd430c8 \
DOWNLOAD_SECRET=9b2c1f80-5d3e-4a7b-8c1d-2e3f4a5b6c7d \
BETTER_AUTH_SECRET=local-integration-secret-000000000000000 \
BETTER_AUTH_URL=http://localhost:3000 bun run test:integration

docker stop nanahoshi-it-postgres nanahoshi-it-redis
```

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
