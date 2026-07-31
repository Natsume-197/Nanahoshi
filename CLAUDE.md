# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nanahoshi v2 is a self-hosted digital book library management system. It scans filesystem paths for ebooks, extracts metadata, indexes them for full-text search with PGroonga, and serves them through a React web frontend.

## Monorepo Structure

Bun workspaces + Turborepo monorepo with the following packages:

- `apps/server` — Hono HTTP server (entry point, wires everything together)
- `apps/web` — TanStack Start/React frontend (Vite, port 3001)
- `packages/api` — Business logic: oRPC routers, repositories, BullMQ workers, catalog search
- `packages/auth` — better-auth instance (email+password, organizations plugin)
- `packages/db` — Drizzle ORM schema + PostgreSQL client
- `packages/env` — Environment variable validation via `@t3-oss/env-core` + Zod
- `packages/config` — Shared TypeScript/build config

## Commands

```bash
# Development
bun run dev              # all services via Turborepo (API + worker + web)
bun run dev:server       # API + worker processes only
bun run dev:web          # web only

# Build
bun run build
bun run check-types

# Linting/Formatting (Biome)
bun run check            # biome check --write .

# Infrastructure (Docker: PostgreSQL with PGroonga, Redis)
bun run infra:up         # start dev containers (reads apps/server/.env)
bun run infra:down
bun run infra:logs

# Database (Drizzle — SQL migrations)
bun run db:generate      # generate migration after schema changes
bun run db:studio        # open Drizzle Studio
# Migrations run automatically on startup via runMigrations(), under a
# Postgres advisory lock (API and worker processes boot concurrently)

# Testing (Bun test runner, no infrastructure needed)
bun test packages/api/                                                  # all api tests
bun test packages/api/src/modules/scanning/__tests__/libraryScanner.test.ts  # scanner tests only
bun test packages/api/src/routers/books/__tests__/book.repository.test.ts  # book repo tests only

# Production (Docker Compose)
docker compose up -d --build
```

## Architecture

### API Layer (`packages/api`)

Uses **oRPC** for type-safe RPC procedures. The base procedure builders are in `packages/api/src/index.ts`:
- `publicProcedure` — no auth required
- `protectedProcedure` — requires authenticated session (throws `UNAUTHORIZED` otherwise)

Routers are composed in `packages/api/src/routers/index.ts` as `appRouter`. Each domain module follows the pattern: `*.router.ts` → `*.service.ts` → `*.repository.ts` + `*.model.ts`.

**Layering rules:**
- **All database access lives in a repository** (`*.repository.ts`). Routers, services, workers, and modules must never run a Drizzle query (`db.select/insert/update/delete/transaction/execute`) directly — they call a repository. (Exception: `auth/access.repository.ts` is permission-resolution orchestration over `access.service`, not pure data access, so it stays a function module.)
- **Repositories are a `class` + exported singleton**: `export class XRepository {} export const xRepository = new XRepository();`. Full-text catalog queries live in the `infrastructure/search` module.
- **Services are optional**: a domain only needs a `*.service.ts` when it has business logic / orchestration. Thin CRUD may go `router → repository` directly. The router itself only validates input and delegates — no business logic.
- **Input/output zod schemas live in `*.model.ts`**, not inline in the router.

Context (`packages/api/src/context.ts`) extracts the better-auth session from request headers on every request.

### Server (`apps/server`)

The backend runs as **two processes** (see `apps/server/src/config/initializers/index.ts`): the API process (`src/index.ts`) and the worker process (`src/worker.ts`). Both run migrations/seed on startup (serialized via a Postgres advisory lock, `withStartupLock`). They communicate only through Postgres and Redis (BullMQ queues + pub/sub), so heavy background jobs never block the API event loop. The worker process lowers its own CPU priority (`os.setPriority(10)`) so the OS favors the API/DB under contention. In production it's the `worker` compose service (`PROCESS_ROLE=worker`, low `cpu_shares`); in dev, the `dev:worker` script.

The **API process** mounts the Hono app:
- `/rpc/*` — oRPC RPC handler (used by the frontend)
- `/api-reference/*` — OpenAPI reference docs
- `/api/auth/*` — better-auth handler
- `/admin/queues/` — Bull Board dashboard for BullMQ queues
- `/download/:uuid` — signed URL file download

The **worker process** registers the BullMQ workers (never import worker modules from API code — instantiating them starts job processing):
- `file.event.worker` — processes file add/delete events, creates book records and triggers metadata enrichment
- `metadata-enrich.worker` — background metadata enrichment
- `cover-color.worker` — extracts dominant colors from book covers
- `scheduled-scan.worker` — executes library scans and reprocesses (scheduled AND manual: the API only creates the task and enqueues a job on the `scheduled-scan` queue, so producer work never runs in the API process and survives restarts via BullMQ stalled-job retry)
- `bookmeter-sync.worker` — imports linked bookmeter.com lists into user shelves (nightly sweep + on-link/manual jobs)
- plus `ranobedb-import`, `send-to-kindle` and the task-progress listeners

Long-running producers (scan phases, bulk enqueue loops) call `throwIfTaskCancelled(taskId)` between batches — cancelling a task stops the heavy work within seconds and always leaves self-healing state (e.g. `scanned_file` rows the next scan re-enqueues). Extend this pattern to any new bulk producer.

### Frontend (`apps/web`)

TanStack Start (SSR-capable) + TanStack Router (file-based routing). Route files live in `apps/web/src/routes/`. The auto-generated `routeTree.gen.ts` should not be edited manually.

The oRPC client is wired into TanStack Query via `createTanstackQueryUtils` in `apps/web/src/utils/orpc.ts`. Use `orpc.<router>.<procedure>.queryOptions(...)` for queries in route loaders and components.

Route context provides `{ orpc, queryClient }` — auth guards use `beforeLoad` to check session and redirect to `/login`.

### Infrastructure (`packages/api/src/infrastructure`)

- **Queue**: BullMQ queues backed by Redis for scans, metadata enrichment and other background work
- **Search**: `infrastructure/search` exposes catalog search backed directly by PostgreSQL with PGroonga (`&@~` operator). It has no external index or synchronization worker.
- **Workers**: Long-running BullMQ workers, auto-scale concurrency based on CPU count

### Database (`packages/db`)

Drizzle ORM with PostgreSQL (groonga/pgroonga image for full-text search support). Schema is split:
- `packages/db/src/schema/general.ts` — app tables: `book`, `book_metadata`, `library`, `library_path`, `user_library`, `author`, `series`, `publisher`, `collection`, `collection_book`, `liked_book`, `scanned_file`, `app_settings`
- `packages/db/src/schema/auth.ts` — better-auth tables (users, sessions, organizations, etc.)
- `packages/db/src/migrate.ts` — programmatic migration runner, called on server startup
- `packages/db/src/migrations/` — SQL migration files generated by `drizzle-kit generate`

**Schema change workflow**: Edit schema files → `bun run db:generate` → commit the new migration → server applies it on next start.

### Environment Variables

Server env is validated in `packages/env/src/server.ts`. Configuration includes database, Redis, authentication, optional SMTP and optional OIDC settings. Place it in `apps/server/.env`.

Web env uses `VITE_SERVER_URL` to point at the backend.

## Testing

Uses **Bun's built-in test runner** (`bun:test`). Tests live in `__tests__/` directories next to the code they test. No infrastructure (DB, Redis, etc.) is needed — all external dependencies are mocked with `mock.module()`.

**Test files:**
- `packages/api/src/modules/scanning/__tests__/libraryScanner.test.ts` — library scanner (scan phases, upsert behavior, job creation, scoping by libraryPathId)
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
