import { describe, mock, test } from "bun:test";

/**
 * Hierarchy + "grant only what you have" tests for the roles router (plan 008).
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
	getUsersWithLibraryAccess: mock(async () => []),
}));

// Repository stubs the router calls.
let existingRole: {
	id: string;
	name: string;
	color: string | null;
	position: number;
	isDefault: boolean;
	permissions: Record<string, string[]>;
} | null = null;
const created: unknown[] = [];

mock.module("../routers/roles/roles.repository", () => ({
	rolesRepository: {
		maxPosition: mock(async () => 1),
		getById: mock(async () => existingRole),
		create: mock(async (input: { position: number }) => {
			created.push(input);
			return { id: "new", ...input };
		}),
		update: mock(async () => existingRole),
		delete: mock(async () => true),
		isMember: mock(async () => true),
		assignableRolesByIds: mock(async () => []),
		setMemberRoles: mock(async () => undefined),
	},
}));

const { rolesRouter } = await import("../routers/roles/roles.router");
const { callAs, expectRejectsWithCode } = await import("./helpers/authHarness");

function pc(o: Partial<PC>): PC {
	return {
		isAppOwner: false,
		isOrgOwner: false,
		hasAdministrator: false,
		highestPosition: 0,
		globalPerms: { roles: ["manage"], member: ["assignRoles"] },
		roleIds: [],
		...o,
	};
}

const ctx = { role: "user", activeOrganizationId: "org-A" } as const;

describe("rolesRouter.create — grant only what you have", () => {
	test("granting a permission you lack → FORBIDDEN", async () => {
		pcResult = pc({ highestPosition: 100, globalPerms: { roles: ["manage"] } });
		await expectRejectsWithCode(
			callAs(
				rolesRouter.create,
				{ name: "X", color: null, permissions: { book: ["delete"] } },
				ctx,
			),
			"FORBIDDEN",
		);
	});

	test("owner can grant anything", async () => {
		pcResult = pc({ isOrgOwner: true, highestPosition: 0 });
		const result = await callAs(
			rolesRouter.create,
			{
				name: "X",
				color: null,
				permissions: { organization: ["administrator"] },
			},
			ctx,
		);
		if (!result) throw new Error("expected a created role");
	});
});

describe("rolesRouter.update — hierarchy", () => {
	test("cannot edit a role at/above your position → FORBIDDEN", async () => {
		existingRole = {
			id: "r1",
			name: "Sup",
			color: null,
			position: 50,
			isDefault: false,
			permissions: {},
		};
		pcResult = pc({ highestPosition: 50 }); // equal → not manageable
		await expectRejectsWithCode(
			callAs(rolesRouter.update, { id: "r1", name: "renamed" }, ctx),
			"FORBIDDEN",
		);
	});

	test("cannot rename the default @everyone role → FORBIDDEN", async () => {
		existingRole = {
			id: "everyone",
			name: "@everyone",
			color: null,
			position: 0,
			isDefault: true,
			permissions: {},
		};
		pcResult = pc({ isOrgOwner: true });
		await expectRejectsWithCode(
			callAs(rolesRouter.update, { id: "everyone", name: "nope" }, ctx),
			"FORBIDDEN",
		);
	});

	test("can edit the default role's permissions when name is unchanged", async () => {
		existingRole = {
			id: "everyone",
			name: "@everyone",
			color: null,
			position: 0,
			isDefault: true,
			permissions: { book: ["read", "download"] },
		};
		pcResult = pc({ isOrgOwner: true });
		// The UI re-sends the unchanged name alongside the edited permissions.
		const result = await callAs(
			rolesRouter.update,
			{ id: "everyone", name: "@everyone", permissions: { book: ["read"] } },
			ctx,
		);
		if (!result) throw new Error("expected the update to succeed");
	});
});

describe("rolesRouter.delete", () => {
	test("cannot delete the default role → FORBIDDEN", async () => {
		existingRole = {
			id: "everyone",
			name: "@everyone",
			color: null,
			position: 0,
			isDefault: true,
			permissions: {},
		};
		pcResult = pc({ isOrgOwner: true });
		await expectRejectsWithCode(
			callAs(rolesRouter.delete, { id: "everyone" }, ctx),
			"FORBIDDEN",
		);
	});
});
