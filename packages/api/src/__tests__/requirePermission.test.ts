import { describe, mock, test } from "bun:test";

/**
 * Tests for the granular `requirePermission` middleware (plan 008, phase 1).
 *
 * Drives the middleware via `call` with a fake context, mocking the DB-backed
 * `getUserPermissionContext` so we control the resolved permission context.
 */

// ─── Mocks (must precede module-under-test import) ────────────────────────────

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

mock.module("@nanahoshi-v2/db", () => ({ db: {} }));

type PC = {
	isAppOwner: boolean;
	isOrgOwner: boolean;
	hasAdministrator: boolean;
	highestPosition: number;
	globalPerms: Record<string, string[]>;
	roleIds: string[];
};

/** Set per-test to control the resolved permission context. */
let pcResult: PC = {
	isAppOwner: false,
	isOrgOwner: false,
	hasAdministrator: false,
	highestPosition: 0,
	globalPerms: {},
	roleIds: [],
};

/** Set per-test to control the per-book action check. */
let bookActionAllowed = true;

mock.module("../auth/access.repository", () => ({
	getUserPermissionContext: mock(async () => pcResult),
	getAccessibleLibraryIds: mock(async () => "ALL" as const),
	resolveLibraryAccess: mock(async () => ({
		pc: pcResult,
		serverId: "org-A",
		accessibleLibraryIds: "ALL" as const,
	})),
	canAccessBookAction: mock(async () => bookActionAllowed),
	getUsersWithLibraryAccess: mock(async () => []),
}));

function pc(overrides: Partial<PC>): PC {
	return {
		isAppOwner: false,
		isOrgOwner: false,
		hasAdministrator: false,
		highestPosition: 0,
		globalPerms: {},
		roleIds: [],
		...overrides,
	};
}

// ─── Module under test ───────────────────────────────────────────────────────

const { requirePermission } = await import("../index");
const { fileRouter } = await import("../routers/files/file.router");
const { callAs, expectRejectsWithCode } = await import("./helpers/authHarness");

const scanLibrary = requirePermission("library", "scan").handler(() => "ok");

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("requirePermission", () => {
	test("anonymous → UNAUTHORIZED", async () => {
		await expectRejectsWithCode(callAs(scanLibrary, {}, null), "UNAUTHORIZED");
	});

	test("authenticated but no active org → BAD_REQUEST", async () => {
		await expectRejectsWithCode(
			callAs(scanLibrary, {}, { activeOrganizationId: null }),
			"BAD_REQUEST",
		);
	});

	test("member without the permission → FORBIDDEN", async () => {
		pcResult = pc({ globalPerms: { library: ["view"] } });
		await expectRejectsWithCode(
			callAs(scanLibrary, {}, { activeOrganizationId: "org-A" }),
			"FORBIDDEN",
		);
	});

	test("member with the permission → passes", async () => {
		pcResult = pc({ globalPerms: { library: ["view", "scan"] } });
		const result = await callAs(
			scanLibrary,
			{},
			{ activeOrganizationId: "org-A" },
		);
		if (result !== "ok")
			throw new Error(`expected "ok", got ${String(result)}`);
	});

	test("org owner bypass → passes without the permission", async () => {
		pcResult = pc({ isOrgOwner: true });
		const result = await callAs(
			scanLibrary,
			{},
			{ activeOrganizationId: "org-A" },
		);
		if (result !== "ok")
			throw new Error(`expected "ok", got ${String(result)}`);
	});

	test("Administrator bypass → passes without the permission", async () => {
		pcResult = pc({ hasAdministrator: true });
		const result = await callAs(
			scanLibrary,
			{},
			{ activeOrganizationId: "org-A" },
		);
		if (result !== "ok")
			throw new Error(`expected "ok", got ${String(result)}`);
	});

	test("app owner (system role) bypass → passes", async () => {
		pcResult = pc({ isAppOwner: true });
		const result = await callAs(
			scanLibrary,
			{},
			{ role: "admin", activeOrganizationId: "org-A" },
		);
		if (result !== "ok")
			throw new Error(`expected "ok", got ${String(result)}`);
	});
});

describe("per-library download gate — fileRouter.getSignedDownloadUrl", () => {
	test("denied book:download in that library → FORBIDDEN", async () => {
		bookActionAllowed = false;
		await expectRejectsWithCode(
			callAs(
				fileRouter.getSignedDownloadUrl,
				{ uuid: "book-uuid" },
				{ activeOrganizationId: "org-A" },
			),
			"FORBIDDEN",
		);
		bookActionAllowed = true;
	});
});
