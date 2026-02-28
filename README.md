# Nanahoshi

A modern, fast, self-hosted, multi-tenant digital library server for managing books and audiobooks. Set up your own and share your collection (work in progress).

## Features

- Full EPUB support
- Reader support (ttu-reader)
- Multilingual support
- Simple setup and deployment with Docker
- High-performance handling of large libraries
- Authentication with multiple providers
- Responsive and optimized for all devices
- Advanced full-text search with multi-language support powered by ElasticSearch

## Quick Start (Docker)

```bash
cp .env.example .env
# Edit .env with your values (secrets, SMTP, paths, etc.)

docker compose up -d --build
```

- **Web**: http://localhost:3001
- **Server**: http://localhost:3000

See `.env.example` for all available configuration options.

### Book libraries

Mount your book directories as volumes in `docker-compose.yml` under the `server` service. You can add as many as you need:

```yaml
volumes:
  - server_data:/app/apps/server/data
  - /path/to/your/manga:/books/manga:ro
  - /path/to/your/novels:/books/novels:ro
```

Then create libraries in the admin UI and set their paths to the container mount points (e.g. `/books/manga`, `/books/novels`).

## Development

### Prerequisites

- [Bun](https://bun.sh/) >= 1.3.1
- Docker (for infrastructure services)

### Setup

```bash
bun install

# Start infrastructure (Postgres, Redis, Elasticsearch)
bun run infra:up

# Generate initial migration (first time only)
bun run db:generate

# Start dev servers (server + web with hot reload)
bun run dev
```

### Database workflow

Nanahoshi uses [Drizzle ORM](https://orm.drizzle.team/) with SQL migrations. Migrations run automatically when the server starts.

```bash
# After modifying the schema in packages/db/src/schema/:
bun run db:generate    # generates a new SQL migration file

# The migration is applied automatically on next server start (bun run dev)
```

### Useful commands

```bash
bun run dev              # all services via Turborepo
bun run dev:server       # server only
bun run dev:web          # web only
bun run build            # production build
bun run check-types      # TypeScript check
bun run check            # Biome lint + format
bun run db:studio        # open Drizzle Studio
bun run infra:logs       # infrastructure container logs
bun run infra:down       # stop infrastructure
docker volume rm nanahoshi-v2_postgres_data nanahoshi-v2_es_data       # Delete all volumes
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
