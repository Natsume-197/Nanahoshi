// Cross-cutting authorization logic, kept in `auth/` because it's consumed by
// `requirePermission`/`orgReadProcedure` and many routers. Pure (no DB) —
// `access.repository.ts` does the I/O.
import {
	type PermissionMap,
	permMapHas,
	type Resource,
	unionPermMaps,
} from "./permissions.catalog";

type Overwrite = {
	allow: PermissionMap;
	deny: PermissionMap;
};

export type LibraryOverwrites = {
	everyone?: Overwrite;
	roles: Overwrite[];
	user?: Overwrite;
};

export type PermissionContext = {
	isAppOwner: boolean;
	isMember: boolean;
	isOrgOwner: boolean;
	hasAdministrator: boolean;
	highestPosition: number;
	globalPerms: PermissionMap;
	roleIds: string[];
};

export type RoleInput = {
	id: string;
	position: number;
	isDefault: boolean;
	permissions: PermissionMap;
};

export type OverwriteInput = {
	libraryId: number;
	subjectType: "everyone" | "role" | "user";
	subjectId: string | null;
	allow: PermissionMap;
	deny: PermissionMap;
};

function isSuperUser(pc: PermissionContext): boolean {
	return pc.isAppOwner || pc.isOrgOwner;
}

/** `member.role` may be a comma-separated list of better-auth roles. */
export function isOwnerRole(role: string | null | undefined): boolean {
	return (
		!!role &&
		role
			.split(",")
			.map((r) => r.trim())
			.includes("owner")
	);
}

/** `roles` must include the org's @everyone (isDefault) role plus assigned roles. */
export function buildPermissionContext(args: {
	isAppOwner: boolean;
	membershipRole: string | null;
	roles: RoleInput[];
}): PermissionContext {
	const isOrgOwner = isOwnerRole(args.membershipRole);

	const globalPerms = unionPermMaps(args.roles.map((r) => r.permissions));
	const hasAdministrator = (globalPerms.organization ?? []).includes(
		"administrator",
	);
	const highestPosition = args.roles.reduce(
		(max, r) => Math.max(max, r.position),
		0,
	);
	const roleIds = args.roles.filter((r) => !r.isDefault).map((r) => r.id);

	return {
		isAppOwner: args.isAppOwner,
		isMember: args.membershipRole !== null,
		isOrgOwner,
		hasAdministrator,
		highestPosition,
		globalPerms,
		roleIds,
	};
}

export function buildLibraryOverwrites(
	rows: OverwriteInput[],
	roleIds: string[],
	userId: string,
): LibraryOverwrites {
	const ov: LibraryOverwrites = { roles: [] };
	const roleSet = new Set(roleIds);
	for (const r of rows) {
		const pair = { allow: r.allow, deny: r.deny };
		if (r.subjectType === "everyone") ov.everyone = pair;
		else if (
			r.subjectType === "role" &&
			r.subjectId &&
			roleSet.has(r.subjectId)
		)
			ov.roles.push(pair);
		else if (r.subjectType === "user" && r.subjectId === userId) ov.user = pair;
	}
	return ov;
}

export function resolveAccessibleLibraryIds(
	pc: PermissionContext,
	libraryIds: number[],
	overwrites: OverwriteInput[],
	userId: string,
): number[] | "ALL" {
	if (pc.isAppOwner || pc.isOrgOwner || pc.hasAdministrator) return "ALL";

	const byLibrary = new Map<number, OverwriteInput[]>();
	for (const row of overwrites) {
		const arr = byLibrary.get(row.libraryId) ?? [];
		arr.push(row);
		byLibrary.set(row.libraryId, arr);
	}

	const accessible: number[] = [];
	for (const id of libraryIds) {
		const ov = buildLibraryOverwrites(
			byLibrary.get(id) ?? [],
			pc.roleIds,
			userId,
		);
		if (can(pc, ov, "library", "view")) accessible.push(id);
	}
	return accessible;
}

export function hasGlobal(
	pc: PermissionContext,
	resource: Resource,
	action: string,
): boolean {
	if (isSuperUser(pc) || pc.hasAdministrator) return true;
	return permMapHas(pc.globalPerms, resource, action);
}

// Discord precedence: owner → administrator (skips overwrites) → global →
// @everyone → role tier (denies then allows, so allow wins) → user (highest).
export function can(
	pc: PermissionContext,
	ov: LibraryOverwrites,
	resource: Resource,
	action: string,
): boolean {
	if (isSuperUser(pc)) return true;
	if (pc.hasAdministrator) return true; // administrator ignores overwrites

	let base = permMapHas(pc.globalPerms, resource, action);

	if (ov.everyone) {
		if (permMapHas(ov.everyone.deny, resource, action)) base = false;
		if (permMapHas(ov.everyone.allow, resource, action)) base = true;
	}

	let anyRoleDeny = false;
	let anyRoleAllow = false;
	for (const o of ov.roles) {
		if (permMapHas(o.deny, resource, action)) anyRoleDeny = true;
		if (permMapHas(o.allow, resource, action)) anyRoleAllow = true;
	}
	if (anyRoleDeny) base = false;
	if (anyRoleAllow) base = true;

	if (ov.user) {
		if (permMapHas(ov.user.deny, resource, action)) base = false;
		if (permMapHas(ov.user.allow, resource, action)) base = true;
	}

	return base;
}

// Hierarchy: owner bypasses; administrator does NOT.
export function canManageRole(
	pc: PermissionContext,
	targetPosition: number,
): boolean {
	if (isSuperUser(pc)) return true;
	return targetPosition < pc.highestPosition;
}

export function canManageMember(
	pc: PermissionContext,
	targetTopPosition: number,
): boolean {
	if (isSuperUser(pc)) return true;
	return targetTopPosition < pc.highestPosition;
}

/** You can only grant actions you hold yourself (owner/administrator hold all). */
export function grantsSubset(
	pc: PermissionContext,
	perms: PermissionMap,
): boolean {
	if (isSuperUser(pc) || pc.hasAdministrator) return true;
	for (const [resource, actions] of Object.entries(perms)) {
		if (!actions) continue;
		for (const action of actions) {
			if (!permMapHas(pc.globalPerms, resource as Resource, action))
				return false;
		}
	}
	return true;
}
