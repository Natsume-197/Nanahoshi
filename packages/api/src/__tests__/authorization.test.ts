import { describe, expect, mock, test } from "bun:test";
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
let canAccessBookActionResult = true;
const deniedBookUuids = new Set<string>();

mock.module("../auth/access.repository", () => ({
	getUserPermissionContext: mock(async () => permissionContext),
	getAccessibleLibraryIds: mock(async () => accessibleLibraryIds),
	getReadContextCached: mock(async () => ({
		pc: permissionContext,
		accessibleLibraryIds,
	})),
	resolveLibraryAccess: mock(async () => null),
	canAccessBookAction: mock(
		async (_session: unknown, uuid: string) =>
			canAccessBookActionResult && !deniedBookUuids.has(uuid),
	),
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

const readListenPair = {
	id: "00000000-0000-4000-8000-000000000030",
	ebook: { uuid: "00000000-0000-4000-8000-000000000010" },
	audiobook: { uuid: "00000000-0000-4000-8000-000000000020" },
};

const readListenTestService = {
	getPairForManagement: mock(async () => readListenPair),
	getPairings: mock(async () => ({
		publication: readListenPair.ebook,
		pairings: [readListenPair],
	})),
	searchCandidates: mock(async () => ({
		publication: readListenPair.ebook,
		candidates: [{ ...readListenPair.audiobook, isPaired: false }],
		pagination: { currentPage: 1, totalPages: 1, totalItems: 1 },
	})),
	getSession: mock(async () => ({
		pair: {
			id: readListenPair.id,
			ebookUuid: readListenPair.ebook.uuid,
			audiobookUuid: readListenPair.audiobook.uuid,
		},
		alignment: { cues: [{ text: { exact: "protected text" } }] },
	})),
	associate: mock(async () => readListenPair),
	generateAlignment: mock(async () => ({ taskId: "task-1", reused: false })),
};

// ─── Dynamically import modules under test (after mocks are in place) ────────

const { libraryRouter } = await import("../routers/libraries/library.router");
const { fileRouter } = await import("../routers/files/file.router");
const { createReadListenRouter } = await import(
	"../routers/read-listen/read-listen.router"
);
const readListenRouter = createReadListenRouter(
	readListenTestService as unknown as Parameters<
		typeof createReadListenRouter
	>[0],
);
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

	describe("book:editMetadata — readListenRouter.associate", () => {
		test("6. a viewer cannot associate two visible publications", async () => {
			canAccessBookActionResult = false;
			try {
				await expectRejectsWithCode(
					callAs(
						readListenRouter.associate,
						{
							publicationUuid: "00000000-0000-4000-8000-000000000010",
							candidateUuid: "00000000-0000-4000-8000-000000000020",
						},
						{ role: "user", activeOrganizationId: "org-A" },
					),
					"FORBIDDEN",
				);
			} finally {
				canAccessBookActionResult = true;
			}
		});

		test("7. a viewer cannot start cloud alignment generation", async () => {
			canAccessBookActionResult = false;
			try {
				await expectRejectsWithCode(
					callAs(
						readListenRouter.generateAlignment,
						{ pairUuid: readListenPair.id },
						{ role: "user", activeOrganizationId: "org-A" },
					),
					"FORBIDDEN",
				);
			} finally {
				canAccessBookActionResult = true;
			}
		});
	});

	describe("book:read — readListenRouter.getSession", () => {
		test("7. a library viewer cannot read aligned text without book access", async () => {
			canAccessBookActionResult = false;
			try {
				await expectRejectsWithCode(
					callAs(
						readListenRouter.getSession,
						{
							pairUuid: readListenPair.id,
							ebookUuid: readListenPair.ebook.uuid,
						},
						{ role: "user", activeOrganizationId: "org-A" },
					),
					"FORBIDDEN",
				);
			} finally {
				canAccessBookActionResult = true;
			}
		});

		test("8. pairings do not reveal a counterpart the caller cannot read", async () => {
			deniedBookUuids.add(readListenPair.audiobook.uuid);
			try {
				const result = await callAs(
					readListenRouter.getPairings,
					{ publicationUuid: readListenPair.ebook.uuid },
					{ role: "user", activeOrganizationId: "org-A" },
				);
				expect(result.pairings).toEqual([]);
			} finally {
				deniedBookUuids.clear();
			}
		});

		test("9. candidate search omits publications the caller cannot read", async () => {
			deniedBookUuids.add(readListenPair.audiobook.uuid);
			try {
				const result = await callAs(
					readListenRouter.searchCandidates,
					{
						publicationUuid: readListenPair.ebook.uuid,
						query: "counterpart",
						limit: 8,
					},
					{ role: "user", activeOrganizationId: "org-A" },
				);
				expect(result.candidates).toEqual([]);
			} finally {
				deniedBookUuids.clear();
			}
		});

		test("10. a session cannot be mounted over a different ebook route", async () => {
			await expectRejectsWithCode(
				callAs(
					readListenRouter.getSession,
					{
						pairUuid: readListenPair.id,
						ebookUuid: "00000000-0000-4000-8000-000000000099",
					},
					{ role: "user", activeOrganizationId: "org-A" },
				),
				"NOT_FOUND",
			);
		});
	});
});
