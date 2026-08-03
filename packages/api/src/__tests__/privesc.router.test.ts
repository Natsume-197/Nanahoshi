import { describe, mock, test } from "bun:test";

/**
 * Privilege-escalation regression tests for the router-level guards added in the
 * pre-launch security audit:
 *
 *   - roles.update: editing the @everyone (default) role's permissions requires
 *     owner/administrator — `canManageRole(pc, 0)` alone was too weak, letting
 *     any custom-role holder broadcast permissions to the whole tenant.
 *   - library-access.upsertOverwrite: an `allow` map is gated by `grantsSubset`,
 *     so a `library:manageAccess` holder can't self-grant permissions they lack.
 *   - invite-links.create: minting an `admin`-role link (which grants better-auth
 *     native org management) requires owner/administrator, not bare
 *     `invitation:create`.
 *
 * Uses the shared oRPC auth harness; `getUserPermissionContext` is mocked so each
 * test drives a specific permission context through the real `requirePermission`
 * middleware and the handler guard.
 */

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
mock.module("@nanahoshi-v2/db", () => ({ db: {} }));

type PC = {
	isAppOwner: boolean;
	isOrgOwner: boolean;
	hasAdministrator: boolean;
	highestPosition: number;
	globalPerms: Record<string, string[]>;
	roleIds: string[];
};

let pcResult: PC = {
	isAppOwner: false,
	isOrgOwner: false,
	hasAdministrator: false,
	highestPosition: 0,
	globalPerms: {},
	roleIds: [],
};

mock.module("../auth/access.repository", () => ({
	getUserPermissionContext: mock(async () => pcResult),
	getAccessibleLibraryIds: mock(async () => "ALL" as const),
	getReadContextCached: mock(async () => ({
		pc: pcResult,
		accessibleLibraryIds: "ALL" as const,
	})),
	getUsersWithLibraryAccess: mock(async () => []),
	invalidatePermissionCaches: mock(() => {}),
}));

// ─── Repository / service stubs ──────────────────────────────────────────────
let existingRole: {
	id: string;
	name: string;
	color: string | null;
	position: number;
	isDefault: boolean;
	permissions: Record<string, string[]>;
} | null = null;

mock.module("../routers/roles/roles.repository", () => ({
	rolesRepository: {
		getById: mock(async () => existingRole),
		update: mock(async () => existingRole),
	},
}));

mock.module("../routers/library-access/library-access.repository", () => ({
	libraryAccessRepository: {
		libraryInOrg: mock(async () => true),
		upsert: mock(async () => undefined),
	},
}));

const createdLinks: unknown[] = [];
// Spread the real service so other test files in the same Bun process keep
// working methods (mock.module leaks across files).
const realInviteLinkService = await import(
	"../routers/invite-links/invite-link.service"
);
mock.module("../routers/invite-links/invite-link.service", () => ({
	inviteLinkService: {
		...realInviteLinkService.inviteLinkService,
		createLink: mock(async (input: unknown) => {
			createdLinks.push(input);
			return { id: "link-1", code: "abc", role: "member" };
		}),
	},
}));

const { rolesRouter } = await import("../routers/roles/roles.router");
const { libraryAccessRouter } = await import(
	"../routers/library-access/library-access.router"
);
const { inviteLinksRouter } = await import(
	"../routers/invite-links/invite-link.router"
);
const { callAs, expectRejectsWithCode } = await import("./helpers/authHarness");

function pc(o: Partial<PC>): PC {
	return {
		isAppOwner: false,
		isOrgOwner: false,
		hasAdministrator: false,
		highestPosition: 0,
		globalPerms: {},
		roleIds: [],
		...o,
	};
}

const ctx = { role: "user", activeOrganizationId: "org-A" } as const;

// ─── roles.update: @everyone permission edits ────────────────────────────────
describe("roles.update — editing @everyone permissions needs owner/admin", () => {
	test("a non-owner with roles:manage + a custom role is FORBIDDEN", async () => {
		existingRole = {
			id: "everyone",
			name: "@everyone",
			color: null,
			position: 0,
			isDefault: true,
			permissions: { book: ["read"] },
		};
		// Has roles:manage (passes requirePermission) and a custom role so the old
		// `canManageRole(pc, 0)` bar would pass — but they are not owner/admin.
		pcResult = pc({
			highestPosition: 1,
			globalPerms: { roles: ["manage"], library: ["scan"] },
			roleIds: ["r_mod"],
		});
		await expectRejectsWithCode(
			callAs(
				rolesRouter.update,
				{
					id: "everyone",
					name: "@everyone",
					permissions: { library: ["scan"] },
				},
				ctx,
			),
			"FORBIDDEN",
		);
	});

	test("an owner CAN edit @everyone permissions", async () => {
		existingRole = {
			id: "everyone",
			name: "@everyone",
			color: null,
			position: 0,
			isDefault: true,
			permissions: { book: ["read"] },
		};
		pcResult = pc({ isOrgOwner: true, globalPerms: { roles: ["manage"] } });
		await callAs(
			rolesRouter.update,
			{ id: "everyone", name: "@everyone", permissions: { book: ["read"] } },
			ctx,
		);
	});
});

// ─── library-access.upsertOverwrite: grantsSubset ────────────────────────────
describe("library-access.upsertOverwrite — grant only what you hold", () => {
	test("granting book:delete you don't hold is FORBIDDEN", async () => {
		pcResult = pc({ globalPerms: { library: ["manageAccess"] } });
		await expectRejectsWithCode(
			callAs(
				libraryAccessRouter.upsertOverwrite,
				{
					libraryId: 10,
					subjectType: "user",
					subjectId: "self",
					allow: { book: ["delete"] },
					deny: {},
				},
				ctx,
			),
			"FORBIDDEN",
		);
	});

	test("granting a permission you DO hold succeeds", async () => {
		pcResult = pc({
			globalPerms: { library: ["manageAccess"], book: ["delete"] },
		});
		await callAs(
			libraryAccessRouter.upsertOverwrite,
			{
				libraryId: 10,
				subjectType: "user",
				subjectId: "self",
				allow: { book: ["delete"] },
				deny: {},
			},
			ctx,
		);
	});
});

// ─── invite-links.create: admin-role links need owner/admin ──────────────────
describe("invite-links.create — admin links need owner/admin", () => {
	test("a non-owner with invitation:create cannot mint an admin link", async () => {
		pcResult = pc({ globalPerms: { invitation: ["create"] } });
		await expectRejectsWithCode(
			callAs(
				inviteLinksRouter.create,
				{ role: "admin", maxUses: null, expiresIn: "never" },
				ctx,
			),
			"FORBIDDEN",
		);
	});

	test("a non-owner CAN mint a member link", async () => {
		pcResult = pc({ globalPerms: { invitation: ["create"] } });
		await callAs(
			inviteLinksRouter.create,
			{ role: "member", maxUses: null, expiresIn: "never" },
			ctx,
		);
	});

	test("an administrator CAN mint an admin link", async () => {
		pcResult = pc({
			hasAdministrator: true,
			globalPerms: { invitation: ["create"] },
		});
		await callAs(
			inviteLinksRouter.create,
			{ role: "admin", maxUses: null, expiresIn: "never" },
			ctx,
		);
	});
});
