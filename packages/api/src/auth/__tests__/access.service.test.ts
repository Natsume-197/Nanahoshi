import { describe, expect, test } from "bun:test";
import {
	can,
	canManageMember,
	canManageRole,
	grantsSubset,
	hasGlobal,
	type LibraryOverwrites,
	type PermissionContext,
} from "../access.service";
import { unionPermMaps } from "../permissions.catalog";

const NO_OV: LibraryOverwrites = { roles: [] };

function ctx(overrides: Partial<PermissionContext> = {}): PermissionContext {
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

describe("hasGlobal", () => {
	test("owner and app owner bypass everything", () => {
		expect(hasGlobal(ctx({ isOrgOwner: true }), "organization", "delete")).toBe(
			true,
		);
		expect(hasGlobal(ctx({ isAppOwner: true }), "member", "remove")).toBe(true);
	});

	test("administrator grants any global action", () => {
		expect(hasGlobal(ctx({ hasAdministrator: true }), "member", "invite")).toBe(
			true,
		);
	});

	test("plain role only grants what it has", () => {
		const pc = ctx({ globalPerms: { member: ["invite"] } });
		expect(hasGlobal(pc, "member", "invite")).toBe(true);
		expect(hasGlobal(pc, "member", "remove")).toBe(false);
	});
});

describe("can — base global perm with no overwrites (default-allow)", () => {
	test("granted globally → allowed", () => {
		const pc = ctx({ globalPerms: { library: ["view"], book: ["download"] } });
		expect(can(pc, NO_OV, "library", "view")).toBe(true);
		expect(can(pc, NO_OV, "book", "download")).toBe(true);
	});

	test("not granted globally → denied", () => {
		const pc = ctx({ globalPerms: { library: ["view"] } });
		expect(can(pc, NO_OV, "book", "download")).toBe(false);
	});
});

describe("can — Discord precedence", () => {
	const pcView = ctx({
		globalPerms: { library: ["view"], book: ["read", "download"] },
	});

	test("deny @everyone hides what was globally allowed", () => {
		const ov: LibraryOverwrites = {
			everyone: { allow: {}, deny: { book: ["download"] } },
			roles: [],
		};
		expect(can(pcView, ov, "book", "download")).toBe(false);
		expect(can(pcView, ov, "book", "read")).toBe(true); // untouched
	});

	test("allow at role tier beats deny at @everyone", () => {
		const ov: LibraryOverwrites = {
			everyone: { allow: {}, deny: { book: ["download"] } },
			roles: [{ allow: { book: ["download"] }, deny: {} }],
		};
		expect(can(pcView, ov, "book", "download")).toBe(true);
	});

	test("allow wins over deny within the role tier (two roles disagree)", () => {
		const ov: LibraryOverwrites = {
			roles: [
				{ allow: {}, deny: { book: ["download"] } },
				{ allow: { book: ["download"] }, deny: {} },
			],
		};
		expect(can(pcView, ov, "book", "download")).toBe(true);
	});

	test("user deny is the highest precedence", () => {
		const ov: LibraryOverwrites = {
			roles: [{ allow: { book: ["download"] }, deny: {} }],
			user: { allow: {}, deny: { book: ["download"] } },
		};
		expect(can(pcView, ov, "book", "download")).toBe(false);
	});

	test("library:view as visibility: deny @everyone hides the library", () => {
		const ov: LibraryOverwrites = {
			everyone: { allow: {}, deny: { library: ["view"] } },
			roles: [],
		};
		expect(can(pcView, ov, "library", "view")).toBe(false);
	});
});

describe("can — administrator and owner bypass overwrites", () => {
	const denyAll: LibraryOverwrites = {
		everyone: { allow: {}, deny: { book: ["download"], library: ["view"] } },
		roles: [],
	};

	test("administrator ignores deny overwrites", () => {
		expect(
			can(ctx({ hasAdministrator: true }), denyAll, "book", "download"),
		).toBe(true);
		expect(
			can(ctx({ hasAdministrator: true }), denyAll, "library", "view"),
		).toBe(true);
	});

	test("org owner ignores deny overwrites", () => {
		expect(can(ctx({ isOrgOwner: true }), denyAll, "book", "download")).toBe(
			true,
		);
	});
});

describe("hierarchy", () => {
	test("canManageRole: only roles strictly below your highest position", () => {
		const pc = ctx({ highestPosition: 5 });
		expect(canManageRole(pc, 4)).toBe(true);
		expect(canManageRole(pc, 5)).toBe(false);
		expect(canManageRole(pc, 6)).toBe(false);
	});

	test("owner bypasses hierarchy", () => {
		expect(
			canManageRole(ctx({ isOrgOwner: true, highestPosition: 0 }), 99),
		).toBe(true);
		expect(
			canManageMember(ctx({ isOrgOwner: true, highestPosition: 0 }), 99),
		).toBe(true);
	});

	test("administrator does NOT bypass hierarchy", () => {
		const admin = ctx({ hasAdministrator: true, highestPosition: 3 });
		expect(canManageRole(admin, 5)).toBe(false);
		expect(canManageMember(admin, 5)).toBe(false);
	});

	test("canManageMember: only members below your top position", () => {
		const pc = ctx({ highestPosition: 5 });
		expect(canManageMember(pc, 4)).toBe(true);
		expect(canManageMember(pc, 5)).toBe(false);
	});
});

describe("grantsSubset — you can only grant what you have", () => {
	test("plain role cannot grant actions it lacks", () => {
		const pc = ctx({ globalPerms: { member: ["invite"] } });
		expect(grantsSubset(pc, { member: ["invite"] })).toBe(true);
		expect(grantsSubset(pc, { member: ["invite", "remove"] })).toBe(false);
		expect(grantsSubset(pc, { organization: ["administrator"] })).toBe(false);
	});

	test("owner and administrator can grant anything", () => {
		expect(
			grantsSubset(ctx({ isOrgOwner: true }), {
				organization: ["administrator"],
			}),
		).toBe(true);
		expect(
			grantsSubset(ctx({ hasAdministrator: true }), { book: ["delete"] }),
		).toBe(true);
	});
});

describe("unionPermMaps", () => {
	test("merges actions across roles without duplicates", () => {
		const merged = unionPermMaps([
			{ book: ["read"], library: ["view"] },
			{ book: ["read", "download"] },
		]);
		expect(new Set(merged.book)).toEqual(new Set(["read", "download"]));
		expect(merged.library).toEqual(["view"]);
	});
});
