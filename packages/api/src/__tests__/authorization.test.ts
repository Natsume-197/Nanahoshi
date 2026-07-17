import { describe, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

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

class MockRedis extends EventEmitter {
	status = "ready";
	options = {};

	duplicate() {
		return new MockRedis();
	}

	connect() {
		return Promise.resolve();
	}

	defineCommand() {}

	info() {
		return Promise.resolve("redis_version:7.0.0\r\n");
	}

	quit() {
		return Promise.resolve();
	}

	disconnect() {}
}

mock.module("ioredis", () => ({
	Redis: MockRedis,
	default: MockRedis,
}));

// ─── Mock: Drizzle DB ────────────────────────────────────────────────────────
// Controls what the permission-context member lookup resolves to.

/** Set per-test to control the member lookup outcome. */
const memberLookupResult: Array<{ role: string }> = [];

function createSelectChain() {
	const chain: Record<string, unknown> = {};
	const self = () => chain;
	chain.from = mock(self);
	chain.where = mock(self);
	chain.innerJoin = mock(self);
	chain.leftJoin = mock(self);
	chain.orderBy = mock(self);
	// limit() is the terminal call in the member lookup — resolve to memberLookupResult
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

// ─── Mock: granular permission context (plan 008) ────────────────────────────
// Controls what requirePermission resolves for the caller.

type FakePC = {
	isAppOwner: boolean;
	isOrgOwner: boolean;
	hasAdministrator: boolean;
	highestPosition: number;
	globalPerms: Record<string, string[]>;
	roleIds: string[];
};

/** Set per-test to control the resolved permission context. */
let permissionContext: FakePC = {
	isAppOwner: false,
	isOrgOwner: false,
	hasAdministrator: false,
	highestPosition: 0,
	globalPerms: {},
	roleIds: [],
};

/** Set per-test to control which libraries the caller may view. */
const accessibleLibraryIds: number[] | "ALL" = "ALL";

mock.module("../auth/access.repository", () => ({
	getUserPermissionContext: mock(async () => permissionContext),
	getAccessibleLibraryIds: mock(async () => accessibleLibraryIds),
	getReadContextCached: mock(async () => ({
		pc: permissionContext,
		accessibleLibraryIds,
	})),
	resolveLibraryAccess: mock(async () => null),
	canAccessBookAction: mock(async () => true),
	getUsersWithLibraryAccess: mock(async () => []),
	invalidatePermissionCaches: mock(() => {}),
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

	describe("requirePermission(library:delete) — libraryRouter.deleteLibrary", () => {
		test("3. member without library:delete is rejected with FORBIDDEN", async () => {
			permissionContext = {
				...permissionContext,
				isOrgOwner: false,
				hasAdministrator: false,
				globalPerms: { library: ["view"] },
			};
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

	describe("requirePermission(library:managePaths) — fileRouter.getDirectories (plan 003 regression)", () => {
		test("4. member without library:managePaths is rejected with FORBIDDEN", async () => {
			permissionContext = {
				...permissionContext,
				isOrgOwner: false,
				hasAdministrator: false,
				globalPerms: { library: ["view"] },
			};
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
