import { describe, expect, test } from "bun:test";
import {
	buildLibraryOverwrites,
	buildPermissionContext,
	can,
	type OverwriteInput,
	type RoleInput,
	resolveAccessibleLibraryIds,
} from "../access.service";
import type { Resource } from "../permissions.catalog";

/**
 * End-to-end verification of the documented scenario (plan 008):
 *
 * Org org_1, libraries 10 (General), 20 (Adultos), 30 (Novedades).
 * Roles: @everyone (default), Premium (r_prem), Moderador (r_mod).
 * - Library 20: invisible to everyone except Premium.
 * - Library 30: everyone reads, only Premium downloads.
 * - Ana is banned from library 30 entirely (user overwrite).
 *
 * Ana → only @everyone. Beto → +Premium. Carla → +Moderador.
 */

// ─── roles ───────────────────────────────────────────────────────────────────
const everyoneRole: RoleInput = {
	id: "r_every",
	position: 0,
	isDefault: true,
	permissions: {
		library: ["view"],
		book: ["read", "download"],
		collection: ["create", "update", "delete"],
		opds: ["access"],
	},
};
const premiumRole: RoleInput = {
	id: "r_prem",
	position: 10,
	isDefault: false,
	permissions: {},
};
const moderatorRole: RoleInput = {
	id: "r_mod",
	position: 50,
	isDefault: false,
	permissions: { member: ["invite"], book: ["editMetadata"] },
};

// ─── overwrites (the rows from the doc) ──────────────────────────────────────
const overwrites: OverwriteInput[] = [
	// 1: library 20 — hide from everyone
	{
		libraryId: 20,
		subjectType: "everyone",
		subjectId: null,
		allow: {},
		deny: { library: ["view"] },
	},
	// 2: library 20 — Premium can view
	{
		libraryId: 20,
		subjectType: "role",
		subjectId: "r_prem",
		allow: { library: ["view"] },
		deny: {},
	},
	// 3: library 30 — nobody downloads
	{
		libraryId: 30,
		subjectType: "everyone",
		subjectId: null,
		allow: {},
		deny: { book: ["download"] },
	},
	// 4: library 30 — Premium downloads
	{
		libraryId: 30,
		subjectType: "role",
		subjectId: "r_prem",
		allow: { book: ["download"] },
		deny: {},
	},
	// 5: library 30 — Ana is banned (can't even view)
	{
		libraryId: 30,
		subjectType: "user",
		subjectId: "ana",
		allow: {},
		deny: { library: ["view"] },
	},
];

const ALL_LIBS = [10, 20, 30];

// ─── permission contexts (as the repo would build them) ──────────────────────
const ana = buildPermissionContext({
	isAppOwner: false,
	membershipRole: "member",
	roles: [everyoneRole],
});
const beto = buildPermissionContext({
	isAppOwner: false,
	membershipRole: "member",
	roles: [everyoneRole, premiumRole],
});
const carla = buildPermissionContext({
	isAppOwner: false,
	membershipRole: "member",
	roles: [everyoneRole, moderatorRole],
});

/** can() for a user against a specific library, applying that library's overwrites. */
function canIn(
	pc: ReturnType<typeof buildPermissionContext>,
	userId: string,
	libraryId: number,
	resource: Resource,
	action: string,
) {
	const rows = overwrites.filter((o) => o.libraryId === libraryId);
	const ov = buildLibraryOverwrites(rows, pc.roleIds, userId);
	return can(pc, ov, resource, action);
}

describe("scenario: visibility (library:view)", () => {
	test("Ana cannot see Adultos (20), can see General (10), banned from Novedades (30)", () => {
		expect(canIn(ana, "ana", 20, "library", "view")).toBe(false);
		expect(canIn(ana, "ana", 10, "library", "view")).toBe(true);
		expect(canIn(ana, "ana", 30, "library", "view")).toBe(false);
	});

	test("Beto (Premium) sees Adultos (20)", () => {
		expect(canIn(beto, "beto", 20, "library", "view")).toBe(true);
	});

	test("Carla (Moderador) cannot see Adultos but sees Novedades", () => {
		expect(canIn(carla, "carla", 20, "library", "view")).toBe(false);
		expect(canIn(carla, "carla", 30, "library", "view")).toBe(true);
	});
});

describe("scenario: download on Novedades (30)", () => {
	test("Beto downloads (Premium allow beats everyone deny)", () => {
		expect(canIn(beto, "beto", 30, "book", "download")).toBe(true);
	});

	test("Carla cannot download (no Premium to rescue the everyone deny)", () => {
		expect(canIn(carla, "carla", 30, "book", "download")).toBe(false);
	});
});

describe("scenario: accessible library sets", () => {
	test("Ana → [10]", () => {
		expect(
			resolveAccessibleLibraryIds(ana, ALL_LIBS, overwrites, "ana"),
		).toEqual([10]);
	});

	test("Beto → [10, 20, 30]", () => {
		expect(
			resolveAccessibleLibraryIds(beto, ALL_LIBS, overwrites, "beto"),
		).toEqual([10, 20, 30]);
	});

	test("Carla → [10, 30]", () => {
		expect(
			resolveAccessibleLibraryIds(carla, ALL_LIBS, overwrites, "carla"),
		).toEqual([10, 30]);
	});
});

describe("scenario: owner bypass", () => {
	test("org owner sees ALL regardless of overwrites", () => {
		const owner = buildPermissionContext({
			isAppOwner: false,
			membershipRole: "owner",
			roles: [everyoneRole],
		});
		expect(
			resolveAccessibleLibraryIds(owner, ALL_LIBS, overwrites, "owner"),
		).toBe("ALL");
	});
});
