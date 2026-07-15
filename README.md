# Nanahoshi

A modern, fast, self-hosted, multi-tenant digital library server for managing books and audiobooks. Set up your own and share your collection (work in progress).

<img width="2560" height="1286" alt="image" src="https://github.com/user-attachments/assets/796110c8-0a61-438e-9fcc-eac7d51addad" />

## Features

- Full EPUB support
- Reader support (ttu-reader)
- Multilingual support
- Simple setup and deployment with Docker
- High-performance handling of large libraries
- Authentication with multiple providers
- Responsive and optimized for all devices
- Advanced full-text search with multi-language support (Elasticsearch or PGroonga)
- Configurable search engine: Elasticsearch for dedicated setups, PGroonga for lightweight deployments

## Quick Start (Docker)

**1. Configure.** Copy the example env and fill in the five required secrets (each one has a comment explaining how to generate it):

```bash
cp .env.example .env

# Required: NAMESPACE_UUID, DOWNLOAD_SECRET (uuidgen),
#           DB_PASSWORD, REDIS_PASSWORD (any strong password),
#           BETTER_AUTH_SECRET (openssl rand -base64 32)
$EDITOR .env
```

Everything else has sensible defaults. SMTP is **optional** — it's only used for email invitations and Send to Kindle; invite links work without it.

**2. Mount your books.** In `docker-compose.yml`, add your book directories as read-only volumes under the `server`/`worker` shared volumes (both services see the same list):

```yaml
volumes:
  - server_data:/app/apps/server/data
  - /path/to/your/manga:/books/manga:ro
  - /path/to/your/novels:/books/novels:ro
```

**3. Start it.** Missing required variables fail immediately with a message naming the variable:

```bash
docker compose up -d --build
```

**4. First boot.** Open **http://localhost:3001** — you'll be taken to the setup wizard to name your server and create the admin account. Then create a library pointing at a mounted folder (e.g. `/books/novels`); the first scan starts automatically and your books appear on the dashboard as they're imported.

After setup, registration is **invite-only**: add people from Settings → Invitations, either by email (needs SMTP) or with an invite link (no SMTP needed).

By default, Nanahoshi uses **PGroonga** for search (no Elasticsearch needed). See [Search Engine](#search-engine) for details. See `.env.example` for all available configuration options.

## Search Engine

Nanahoshi supports two search backends, configurable via the `SEARCH_PROVIDER` environment variable:

### PGroonga (default)

Built-in PostgreSQL full-text search using [PGroonga](https://pgroonga.github.io/). No additional services needed, searches query the database directly with full Japanese language support via Groonga.

```bash
SEARCH_PROVIDER=pgroonga  # default, no extra config needed
```

### Elasticsearch

External search engine with advanced analyzers (Sudachi tokenizer for Japanese). Requires running an Elasticsearch instance.

```bash
SEARCH_PROVIDER=elasticsearch
ELASTICSEARCH_NODE=http://elasticsearch:9200  # required when using elasticsearch
ELASTICSEARCH_INDEX_PREFIX=nanahoshi          # optional, defaults to "nanahoshi"
```

With Docker Compose, enable the Elasticsearch service using the `elasticsearch` profile:

```bash
SEARCH_PROVIDER=elasticsearch docker compose --profile elasticsearch up -d --build
```

When using Elasticsearch, book indexing is handled automatically via event-driven sync — no manual reindex is needed for normal operations. A manual reindex button is available in the admin panel for exceptional cases.

## Development

### Prerequisites

- [Bun](https://bun.sh/) >= 1.3.1
- Docker (for infrastructure services)

### Setup

```bash
bun install

# Start infrastructure (Postgres, Redis, and optionally Elasticsearch)
bun run infra:up

# To also start Elasticsearch and Kibana for development:
# docker compose -f docker-compose.dev.yml --profile elasticsearch up -d

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

### Commands

```bash
# Development
bun run dev              # all services via Turborepo
bun run dev:server       # server only
bun run dev:web          # web only

# Build
bun run build
bun run check-types

# Linting/Formatting (Biome)
bun run check            # biome check --write .

# Infrastructure (Docker: Postgres, Redis)
bun run infra:up         # start dev containers (reads apps/server/.env)
bun run infra:down
bun run infra:logs

# Database (Drizzle — SQL migrations)
bun run db:generate      # generate migration after schema changes
bun run db:studio        # open Drizzle Studio

# Testing (Bun test runner, no infrastructure needed)
bun test packages/api/   # run all api tests

# Production (Docker Compose)
docker compose up -d --build                                             # PGroonga (default)
SEARCH_PROVIDER=elasticsearch docker compose --profile elasticsearch up -d --build  # with Elasticsearch

# Cleanup
docker volume rm nanahoshi-v2_postgres_data nanahoshi-v2_es_data   # delete all volumes
```

## Testing

Uses **Bun's built-in test runner** (`bun:test`). Tests live in `__tests__/` directories next to the code they test. No infrastructure (DB, Redis, etc.) is needed — all external dependencies are mocked with `mock.module()`.

```bash
bun test packages/api/                                                  # all api tests
bun test packages/api/src/modules/__tests__/libraryScanner.test.ts      # scanner tests only
bun test packages/api/src/routers/books/__tests__/book.repository.test.ts  # book repo tests only
```

### Offline recommendation evaluation

With Postgres running and recommendation artifacts already built, evaluate the
current ranker without changing user data or persisted feeds:

```bash
bun run recs:evaluate --cases=50 --k=10
# one organization, machine-readable output
bun run recs:evaluate --server=<organization-id> --cases=50 --k=10 --json
# deterministic coherent fixture; does not require Postgres
bun run recs:evaluate --synthetic --cases=100 --k=10
```

The evaluator creates chronological cases for every new liked/completed work
after warm-up. At each cutoff it rebuilds engagement, collaborative similarity,
popularity, candidates, exclusions and negative feedback from earlier events
only, then compares the current hybrid ranker with a historical popularity
baseline. It reports Recall@K, NDCG@K, MRR, catalog coverage, novelty,
intra-list diversity, and negative-feedback exposure. Metadata and embeddings
use a fixed catalog snapshot; behavioral artifacts are leakage-free. Runs are
deterministic with `--seed=42`.

## Acknowledgements

- [ttu-reader](https://github.com/ttu-ttu/ebook-reader): The integrated ebook reader used in Nanahoshi. Thanks to the ttu-ttu team for building such a great open-source reader.

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
