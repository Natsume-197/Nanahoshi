import { describe, expect, test } from "bun:test";
import {
	buildPermissionContext,
	hasGlobal,
	resolveAccessibleLibraryIds,
} from "../access.service";
import { accessibleCondition } from "../../routers/_shared/library-scope";

/**
 * Multi-tenant isolation regression tests for the two root causes fixed in the
 * pre-launch security audit. These exercise the PURE building blocks the fixes
 * rely on (the DB-backed `getUserPermissionContext`/`resolveBookScope` can't be
 * unit-tested here because sibling router test files globally mock
 * `auth/access.repository` in the shared Bun process; their router-level effects
 * are covered by privesc.router.test.ts and service-scope-guards.test.ts).
 *
 *   R1 — a non-member resolves to ZERO permissions. The repository early-returns
 *        `buildPermissionContext({ roles: [] })` for a caller with no membership,
 *        so we assert that empty context grants nothing and sees no libraries.
 *
 *   R2 — scope resolution fails closed. An empty/undefined library scope must
 *        compile to a predicate that matches NOTHING, never "no filter".
 */

// ─── R1: a non-member's permission context grants nothing ────────────────────
describe("R1: non-member permission context is empty", () => {
	const nonMember = buildPermissionContext({
		isAppOwner: false,
		membershipRole: null,
		roles: [], // what getUserPermissionContext passes when there's no membership
	});

	test("holds no global permissions", () => {
		expect(hasGlobal(nonMember, "opds", "access")).toBe(false);
		expect(hasGlobal(nonMember, "book", "read")).toBe(false);
		expect(hasGlobal(nonMember, "book", "download")).toBe(false);
		expect(hasGlobal(nonMember, "library", "view")).toBe(false);
	});

	test("is neither org owner nor administrator", () => {
		expect(nonMember.isOrgOwner).toBe(false);
		expect(nonMember.hasAdministrator).toBe(false);
	});

	test("can access no libraries in the target server", () => {
		// Even though the server has libraries, an empty context sees none.
		expect(
			resolveAccessibleLibraryIds(nonMember, [10, 20, 30], [], "attacker"),
		).toEqual([]);
	});
});

// ─── R2: accessibleCondition fails closed ────────────────────────────────────
describe("R2: accessibleCondition (library scope → SQL predicate)", () => {
	test('"ALL" returns undefined (owner/admin: no restriction)', () => {
		expect(accessibleCondition("ALL")).toBeUndefined();
	});

	test("a non-empty scope returns a predicate (restricted)", () => {
		expect(accessibleCondition([10, 20])).toBeDefined();
	});

	test("an EMPTY scope returns a predicate, NOT undefined (matches nothing)", () => {
		// Regression: an empty scope used to return undefined = "no filter" =
		// every tenant's books. It must now be a hard `false` predicate.
		expect(accessibleCondition([])).toBeDefined();
	});

	test("an undefined scope returns a predicate, NOT undefined (fail closed)", () => {
		expect(accessibleCondition(undefined)).toBeDefined();
	});
});
