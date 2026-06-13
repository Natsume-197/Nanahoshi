# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nanahoshi v2 is a self-hosted digital book library management system. It scans filesystem paths for ebooks, extracts metadata, indexes them for full-text search (via Elasticsearch or PGroonga), and serves them through a React web frontend.

## Monorepo Structure

Bun workspaces + Turborepo monorepo with the following packages:

- `apps/server` — Hono HTTP server (entry point, wires everything together)
- `apps/web` — TanStack Start/React frontend (Vite, port 3001)
- `packages/api` — Business logic: oRPC routers, repositories, BullMQ workers, search providers
- `packages/auth` — better-auth instance (email+password, organizations plugin)
- `packages/db` — Drizzle ORM schema + PostgreSQL client
- `packages/env` — Environment variable validation via `@t3-oss/env-core` + Zod
- `packages/config` — Shared TypeScript/build config

## Commands

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

# Infrastructure (Docker: Postgres, Redis; optionally Elasticsearch + Kibana via --profile elasticsearch)
bun run infra:up         # start dev containers (reads apps/server/.env)
bun run infra:down
bun run infra:logs

# Database (Drizzle — SQL migrations)
bun run db:generate      # generate migration after schema changes
bun run db:studio        # open Drizzle Studio
# Migrations run automatically on server startup via runMigrations()

# Testing (Bun test runner, no infrastructure needed)
bun test packages/api/                                                  # all api tests
bun test packages/api/src/modules/__tests__/libraryScanner.test.ts      # scanner tests only
bun test packages/api/src/routers/books/__tests__/book.repository.test.ts  # book repo tests only

# Production (Docker Compose)
docker compose up -d --build                                             # PGroonga (default, no ES)
SEARCH_PROVIDER=elasticsearch docker compose --profile elasticsearch up -d --build  # with Elasticsearch
```

## Architecture

### API Layer (`packages/api`)

Uses **oRPC** for type-safe RPC procedures. The base procedure builders are in `packages/api/src/index.ts`:
- `publicProcedure` — no auth required
- `protectedProcedure` — requires authenticated session (throws `UNAUTHORIZED` otherwise)

Routers are composed in `packages/api/src/routers/index.ts` as `appRouter`. Each domain module follows the pattern: `*.router.ts` → `*.service.ts` → `*.repository.ts` + `*.model.ts`.

Context (`packages/api/src/context.ts`) extracts the better-auth session from request headers on every request.

### Server (`apps/server`)

The Hono app mounts:
- `/rpc/*` — oRPC RPC handler (used by the frontend)
- `/api-reference/*` — OpenAPI reference docs
- `/api/auth/*` — better-auth handler
- `/admin/queues/` — Bull Board dashboard for BullMQ queues
- `/download/:uuid` — signed URL file download

On startup, runs `runMigrations()`, then `firstSeed()`, initializes the search provider, and registers BullMQ workers:
- `file.event.worker` — processes file add/delete events, creates book records, triggers metadata enrichment and search sync
- `search-sync.worker` — event-driven search index sync (Elasticsearch only)
- `book.index.worker` — full reindex (Elasticsearch only, triggered manually from admin)
- `cover-color.worker` — extracts dominant colors from book covers

### Frontend (`apps/web`)

TanStack Start (SSR-capable) + TanStack Router (file-based routing). Route files live in `apps/web/src/routes/`. The auto-generated `routeTree.gen.ts` should not be edited manually.

The oRPC client is wired into TanStack Query via `createTanstackQueryUtils` in `apps/web/src/utils/orpc.ts`. Use `orpc.<router>.<procedure>.queryOptions(...)` for queries in route loaders and components.

Route context provides `{ orpc, queryClient }` — auth guards use `beforeLoad` to check session and redirect to `/login`.

### Infrastructure (`packages/api/src/infrastructure`)

- **Queue**: BullMQ queues (`book-index`, `file-events`, `search-sync`) backed by Redis
- **Search**: Provider pattern with `SearchProvider` interface (`search.provider.ts`), factory (`search.factory.ts`), and two implementations:
  - `elasticsearch/` — Elasticsearch with Sudachi tokenizer, event-driven sync via `search-sync` queue
  - `pgroonga/` — PGroonga full-text search directly in PostgreSQL (no sync needed, `&@~` operator)
  - Configured via `SEARCH_PROVIDER` env var (`pgroonga` default, `elasticsearch` optional)
- **Workers**: Long-running BullMQ workers, auto-scale concurrency based on CPU count

### Database (`packages/db`)

Drizzle ORM with PostgreSQL (groonga/pgroonga image for full-text search support). Schema is split:
- `packages/db/src/schema/general.ts` — app tables: `book`, `book_metadata`, `library`, `library_path`, `user_library`, `author`, `series`, `publisher`, `collection`, `collection_book`, `liked_book`, `scanned_file`, `app_settings`
- `packages/db/src/schema/auth.ts` — better-auth tables (users, sessions, organizations, etc.)
- `packages/db/src/migrate.ts` — programmatic migration runner, called on server startup
- `packages/db/src/migrations/` — SQL migration files generated by `drizzle-kit generate`

**Schema change workflow**: Edit schema files → `bun run db:generate` → commit the new migration → server applies it on next start.

### Environment Variables

Server env validated in `packages/env/src/server.ts`. Required vars include: `DATABASE_URL`, `CORS_ORIGIN`, `NAMESPACE_UUID`, `DOWNLOAD_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMTP_*`, and optionally `SEARCH_PROVIDER` (`pgroonga`|`elasticsearch`, default `pgroonga`), `ELASTICSEARCH_NODE` (required when using ES), `REDIS_*`. Place in `apps/server/.env`.

Web env uses `VITE_SERVER_URL` to point at the backend.

## Testing

Uses **Bun's built-in test runner** (`bun:test`). Tests live in `__tests__/` directories next to the code they test. No infrastructure (DB, Redis, etc.) is needed — all external dependencies are mocked with `mock.module()`.

**Test files:**
- `packages/api/src/modules/__tests__/libraryScanner.test.ts` — library scanner (scan phases, upsert behavior, job creation, scoping by libraryPathId)
- `packages/api/src/routers/books/__tests__/book.repository.test.ts` — book repository (insert, conflict handling, composite unique key, deletion)

**Mocking pattern:** Tests mock Drizzle's chainable query builder (`db.insert().values().onConflictDoUpdate()`) by returning objects whose methods return `this` and that resolve to configurable arrays when awaited. External modules (`@nanahoshi-v2/db`, queues, filesystem) are mocked via `mock.module()` before the module under test is dynamically imported.

**Important:** When mocking `@nanahoshi-v2/db/schema/general`, re-export all real schema exports (`...realSchema`) to prevent mock pollution across test files that share the same Bun process.

## Key Conventions

- **Package manager**: Bun (not npm/yarn). Use `bun add`, `bun install`.
- **Linter/Formatter**: Biome with tabs for indentation and double quotes for JS strings.
- **Type safety**: oRPC provides end-to-end type safety between `packages/api` and `apps/web` — the frontend imports `AppRouter` type from `@nanahoshi-v2/api/routers/index`.
- **Workspace imports**: Packages reference each other via `workspace:*` aliases (e.g., `@nanahoshi-v2/api`, `@nanahoshi-v2/db`).
- **Catalog**: Shared dependency versions are defined in the root `package.json` `workspaces.catalog` field and referenced with `catalog:` in individual `package.json` files.

## No useEffect Rule

**Never call `useEffect` directly in components or custom hooks.** This is a strict codebase convention. Background: React's [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect). Apply the correct replacement pattern instead:

| Instead of useEffect for... | Use |
|---|---|
| Deriving state from other state/props | Inline computation (compute during render) |
| Fetching data | `useQuery` / TanStack Query |
| Responding to user actions | Event handlers |
| One-time external sync on mount | `useMountEffect` (the only sanctioned escape hatch) |
| Resetting state when a prop changes | `key` prop on parent, or render-phase ref tracking |

### Escape hatch: `useMountEffect`

Defined in `apps/web/src/hooks/use-mount-effect.ts`. This is the **only** place `useEffect` is imported directly. Use it exclusively for setup/cleanup of external systems on mount (service workers, SSE, IndexedDB repair, etc.).

### Utility hooks (prefer these over `useMountEffect` in components)

These hooks encapsulate `useMountEffect` internally so components stay declarative:

- `useWindowEvent(type, handler)` — subscribe to a `window` event
- `useDocumentEvent(type, handler)` — subscribe to a `document` event
- `useInterval(callback, ms)` — run a callback on a fixed interval
- `useOnUnmount(callback)` — run a callback when the component unmounts

All live in `apps/web/src/hooks/`.

### Render-phase patterns

For state that depends on props/other state, adjust during render with a ref guard instead of `useEffect`:

```tsx
const prevValueRef = useRef(value);
if (value !== prevValueRef.current) {
  prevValueRef.current = value;
  setDerivedState(computeFrom(value));
}
```

### What NOT to do

- **No side effects during render** — API calls, navigation, toasts must go in event handlers or `useMountEffect`, never in the render body.
- **No `useEffect` with dependencies** — if you need to react to a value change, use derived state (inline computation), render-phase ref tracking, or a `key` prop reset.
- **No `useEffect` for data fetching** — always use TanStack Query (`useQuery`, `useInfiniteQuery`, `useMutation`).

### Replacement patterns in detail

**Rule 1 — Derive state, don't sync it.** *Smell test:* you're about to write `useEffect(() => setX(deriveFromY(y)), [y])`, or you have state that only mirrors other state/props.

```tsx
// BAD: two render cycles
const [filtered, setFiltered] = useState([]);
useEffect(() => setFiltered(products.filter((p) => p.inStock)), [products]);

// GOOD: compute inline in one render
const filtered = products.filter((p) => p.inStock);
```

**Rule 2 — Use TanStack Query for fetching.** *Smell test:* your effect does `fetch(...)` then `setState(...)`, or re-implements caching/retries/cancellation.

```tsx
// BAD: race condition risk
useEffect(() => { fetchProduct(productId).then(setProduct); }, [productId]);

// GOOD: query library handles cancellation/caching/staleness
const { data: product } = useQuery(orpc.product.get.queryOptions({ input: { productId } }));
```

**Rule 3 — Event handlers, not effects.** *Smell test:* state is used as a flag so an effect can do the real action ("set flag → effect runs → reset flag").

```tsx
// BAD: effect as an action relay
useEffect(() => { if (liked) { postLike(); setLiked(false); } }, [liked]);
// GOOD
<button onClick={() => postLike()}>Like</button>
```

**Rule 4 — `useMountEffect` for one-time external sync.** *Smell test:* synchronizing with an external system, behavior is naturally "setup on mount, cleanup on unmount." Mount the component only when preconditions are met (early-return the wrapper) rather than guarding inside the effect.

```tsx
// BAD: useEffect with a dependency that never changes
useEffect(() => {
  connectionManager.on("connected", handleConnect);
  return () => connectionManager.off("connected", handleConnect);
}, [connectionManager]); // singleton from context

// GOOD
useMountEffect(() => {
  connectionManager.on("connected", handleConnect);
  return () => connectionManager.off("connected", handleConnect);
});
```

**Rule 5 — Reset with `key`, not dependency choreography.** *Smell test:* an effect whose only job is to reset local state when an ID/prop changes.

```tsx
// GOOD: key forces a clean remount per entity
<VideoPlayer key={videoId} videoId={videoId} />;
function VideoPlayer({ videoId }) { useMountEffect(() => loadVideo(videoId)); }
```

### Component structure convention

Computed values come after hooks and local state, never via `useEffect` + `setState`:

```tsx
export function FeatureComponent({ featureId }: ComponentProps) {
  const { data, isLoading } = useQueryFeature(featureId); // hooks first
  const [isOpen, setIsOpen] = useState(false);            // local state
  const displayName = user?.name ?? "Unknown";            // computed values
  const handleClick = () => setIsOpen(true);              // event handlers
  if (isLoading) return <Loading />;                       // early returns
  return <Flex direction="column" gap="lg">...</Flex>;     // render
}
```
