import { describe, mock, test } from "bun:test";

/**
 * Authorization gate tests for org-scoped oRPC procedures.
 *
 * These tests drive the middleware chain directly via `call` from `@orpc/server`,
 * so they run with no infrastructure (no DB, no Redis, no queue connections).
 * All assertions are on the error's `.code` property thrown by the middleware
 * before any handler or service logic runs.
 *
 * Run with:
 *   bun test packages/api/src/__tests__/authorization.test.ts
 */

// ─── Mock: env ───────────────────────────────────────────────────────────────
// Must come before any module that reads env at import time
// (redis, urlSigner, search.factory, etc.).

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
		DOWNLOAD_SECRET: "00000000-0000-0000-0000-000000000001",
		CORS_ORIGIN: "http://localhost:3000",
		BETTER_AUTH_SECRET: "mock-secret-that-is-at-least-32-chars-long",
		BETTER_AUTH_URL: "http://localhost:3000",
		REDIS_HOST: "127.0.0.1",
		REDIS_PORT: 6379,
		SMTP_HOST: "smtp.example.com",
		SMTP_PORT: 465,
		SMTP_SECURE: true,
		SMTP_USER: "mock@example.com",
		SMTP_PASS: "mock",
		SEARCH_PROVIDER: "pgroonga",
	},
}));

// ─── Mock: Redis (prevent real connection attempts) ───────────────────────────

mock.module("ioredis", () => ({
	Redis: class MockRedis {
		on() {
			return this;
		}
		quit() {
			return Promise.resolve();
		}
	},
}));

// ─── Mock: Drizzle DB ────────────────────────────────────────────────────────
// Controls what the requireOrgAdmin middleware's member lookup resolves to.

/** Set per-test to control the member lookup outcome. */
let memberLookupResult: Array<{ role: string }> = [];

function createSelectChain() {
	const chain: Record<string, unknown> = {};
	const self = () => chain;
	chain.from = mock(self);
	chain.where = mock(self);
	chain.innerJoin = mock(self);
	chain.leftJoin = mock(self);
	chain.orderBy = mock(self);
	// limit() is the terminal call in requireOrgAdmin — resolve to memberLookupResult
	chain.limit = mock(() => Promise.resolve(memberLookupResult));
	return chain;
}

mock.module("@nanahoshi-v2/db", () => ({
	db: {
		insert: mock(() => {
			const c: Record<string, unknown> = {};
			const s = () => c;
			c.values = mock(s);
			c.onConflictDoNothing = mock(s);
			c.onConflictDoUpdate = mock(s);
			c.returning = mock(() => Promise.resolve([]));
			return c;
		}),
		select: mock(() => createSelectChain()),
		update: mock(() => {
			const c: Record<string, unknown> = {};
			const s = () => c;
			c.set = mock(s);
			c.where = mock(s);
			return c;
		}),
		delete: mock(() => {
			const c: Record<string, unknown> = {};
			c.where = mock(() => Promise.resolve({ rowCount: 0 }));
			return c;
		}),
	},
}));

// ─── Mock: BullMQ queues (prevent Redis connections via queue constructors) ──

const noopQueue = {
	add: mock(() => Promise.resolve()),
	addBulk: mock(() => Promise.resolve()),
};

mock.module("../infrastructure/queue/queues/file-event.queue", () => ({
	fileEventQueue: noopQueue,
}));
mock.module("../infrastructure/queue/queues/search-sync.queue", () => ({
	searchSyncQueue: noopQueue,
}));
mock.module("../infrastructure/queue/queues/book-index.queue", () => ({
	bookIndexQueue: noopQueue,
}));
mock.module("../infrastructure/queue/queues/metadata-enrich.queue", () => ({
	metadataEnrichQueue: noopQueue,
}));
mock.module("../infrastructure/queue/queues/ranobedb-import.queue", () => ({
	ranobedbImportQueue: noopQueue,
}));
mock.module("../infrastructure/queue/queues/send-to-kindle.queue", () => ({
	sendToKindleQueue: noopQueue,
}));
mock.module("../infrastructure/queue/redis", () => ({
	redis: {
		on: () => ({}),
		quit: () => Promise.resolve(),
	},
}));

// ─── Dynamically import modules under test (after mocks are in place) ────────

const { libraryRouter } = await import("../routers/libraries/library.router");
const { fileRouter } = await import("../routers/files/file.router");
const { callAs, expectRejectsWithCode } = await import("./helpers/authHarness");

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("middleware authorization gates", () => {
	describe("orgProcedure — libraryRouter.getLibraryById", () => {
		test("1. anonymous caller is rejected with UNAUTHORIZED", async () => {
			await expectRejectsWithCode(
				callAs(libraryRouter.getLibraryById, { id: 1 }, null),
				"UNAUTHORIZED",
			);
		});

		test("2. authenticated but no active org is rejected with BAD_REQUEST", async () => {
			await expectRejectsWithCode(
				callAs(
					libraryRouter.getLibraryById,
					{ id: 1 },
					{ activeOrganizationId: null },
				),
				"BAD_REQUEST",
			);
		});
	});

	describe("orgAdminProcedure — libraryRouter.deleteLibrary", () => {
		test("3. non-admin member (no membership row) is rejected with FORBIDDEN", async () => {
			memberLookupResult = [];
			await expectRejectsWithCode(
				callAs(
					libraryRouter.deleteLibrary,
					{ id: 1 },
					{ role: "user", activeOrganizationId: "org-A" },
				),
				"FORBIDDEN",
			);
		});
	});

	describe("orgAdminProcedure — fileRouter.getDirectories (plan 003 regression)", () => {
		test("4. non-admin member is rejected with FORBIDDEN", async () => {
			memberLookupResult = [];
			await expectRejectsWithCode(
				callAs(
					fileRouter.getDirectories,
					{ location: "/" },
					{ role: "user", activeOrganizationId: "org-A" },
				),
				"FORBIDDEN",
			);
		});

		test("5. anonymous caller is rejected with UNAUTHORIZED", async () => {
			await expectRejectsWithCode(
				callAs(fileRouter.getDirectories, { location: "/" }, null),
				"UNAUTHORIZED",
			);
		});
	});
});
