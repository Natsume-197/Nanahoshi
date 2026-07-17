import { randomBytes } from "node:crypto";
import { db } from "@nanahoshi-v2/db";
import { member, user } from "@nanahoshi-v2/db/schema/auth";
import {
	book,
	library,
	libraryPermissionOverwrite,
	memberRole,
	role,
} from "@nanahoshi-v2/db/schema/general";
import { and, eq, inArray, or } from "drizzle-orm";
import { TtlPromiseCache } from "../lib/ttl-promise-cache";
import {
	buildLibraryOverwrites,
	buildPermissionContext,
	can,
	hasGlobal,
	type LibraryOverwrites,
	type OverwriteInput,
	type PermissionContext,
	type RoleInput,
	resolveAccessibleLibraryIds,
} from "./access.service";
import type { PermissionMap, Resource } from "./permissions.catalog";

/** Baseline reader permissions seeded into every org's @everyone role. */
const DEFAULT_EVERYONE_PERMISSIONS: PermissionMap = {
	library: ["view"],
	book: ["read", "download"],
	collection: ["read", "create", "update", "delete"],
	progress: ["read", "write"],
	like: ["create"],
	opds: ["access"],
};

const EVERYONE_ROLE_NAME = "@everyone";

function generateId(): string {
	return randomBytes(16).toString("hex");
}

/** Idempotent: creates the org's @everyone role if missing. */
export async function ensureDefaultRole(serverId: string) {
	const [existing] = await db
		.select({ id: role.id })
		.from(role)
		.where(and(eq(role.serverId, serverId), eq(role.isDefault, true)))
		.limit(1);
	if (existing) return existing.id;

	const id = generateId();
	await db.insert(role).values({
		id,
		serverId,
		name: EVERYONE_ROLE_NAME,
		position: 0,
		isDefault: true,
		permissions: DEFAULT_EVERYONE_PERMISSIONS,
	});
	return id;
}

/** Seeds the @everyone role for every existing org. Runs on startup. */
export async function ensureDefaultRoles() {
	const orgs = await db
		.selectDistinct({ serverId: member.organizationId })
		.from(member);
	for (const { serverId } of orgs) {
		await ensureDefaultRole(serverId);
	}
}

export async function getUserPermissionContext(
	userId: string,
	serverId: string,
	opts: { isAppOwner: boolean },
): Promise<PermissionContext> {
	const [membership] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, serverId)))
		.limit(1);

	// A caller who is not a current member of this server gets ZERO permissions —
	// not even the @everyone baseline. Without this, a forged serverId (e.g. via a
	// client-set API-key metadata.serverId) or a removed member with a stale
	// session would inherit the target org's default role. App owners (global
	// admins) legitimately bypass org membership.
	if (!membership && !opts.isAppOwner) {
		return buildPermissionContext({
			isAppOwner: false,
			membershipRole: null,
			roles: [],
		});
	}

	const defaultRoles = await db
		.select({
			id: role.id,
			position: role.position,
			isDefault: role.isDefault,
			permissions: role.permissions,
		})
		.from(role)
		.where(and(eq(role.serverId, serverId), eq(role.isDefault, true)));

	const assignedRoles = await db
		.select({
			id: role.id,
			position: role.position,
			isDefault: role.isDefault,
			permissions: role.permissions,
		})
		.from(memberRole)
		.innerJoin(role, eq(memberRole.roleId, role.id))
		.where(
			and(eq(memberRole.userId, userId), eq(memberRole.serverId, serverId)),
		);

	const roles: RoleInput[] = [...defaultRoles, ...assignedRoles];

	return buildPermissionContext({
		isAppOwner: opts.isAppOwner,
		membershipRole: membership?.role ?? null,
		roles,
	});
}

/** Overwrites targeting everyone, any of the user's roles, or the user directly. */
async function fetchRelevantOverwrites(
	userId: string,
	pc: PermissionContext,
	scope: { serverId: string } | { libraryId: number },
): Promise<OverwriteInput[]> {
	const scopeFilter =
		"serverId" in scope
			? eq(libraryPermissionOverwrite.serverId, scope.serverId)
			: eq(libraryPermissionOverwrite.libraryId, scope.libraryId);

	const rows = await db
		.select({
			libraryId: libraryPermissionOverwrite.libraryId,
			subjectType: libraryPermissionOverwrite.subjectType,
			subjectId: libraryPermissionOverwrite.subjectId,
			allow: libraryPermissionOverwrite.allow,
			deny: libraryPermissionOverwrite.deny,
		})
		.from(libraryPermissionOverwrite)
		.where(
			and(
				scopeFilter,
				or(
					eq(libraryPermissionOverwrite.subjectType, "everyone"),
					pc.roleIds.length > 0
						? and(
								eq(libraryPermissionOverwrite.subjectType, "role"),
								inArray(libraryPermissionOverwrite.subjectId, pc.roleIds),
							)
						: undefined,
					and(
						eq(libraryPermissionOverwrite.subjectType, "user"),
						eq(libraryPermissionOverwrite.subjectId, userId),
					),
				),
			),
		);
	return rows;
}

/** Library ids the user may view, or "ALL" for owners/administrators. */
export async function getAccessibleLibraryIds(
	userId: string,
	serverId: string,
	pc: PermissionContext,
): Promise<number[] | "ALL"> {
	if (pc.isAppOwner || pc.isOrgOwner || pc.hasAdministrator) return "ALL";

	const libs = await db
		.select({ id: library.id })
		.from(library)
		.where(eq(library.serverId, serverId));
	if (libs.length === 0) return [];

	const overwrites = await fetchRelevantOverwrites(userId, pc, {
		serverId,
	});
	return resolveAccessibleLibraryIds(
		pc,
		libs.map((l) => l.id),
		overwrites,
		userId,
	);
}

const readContextCache = new TtlPromiseCache<{
	pc: PermissionContext;
	accessibleLibraryIds: number[] | "ALL";
}>(10_000, 1000);

/**
 * Permission context + accessible libraries for read procedures, resolved once
 * per user/server within a short TTL. A dashboard load fans out ~10 parallel
 * RPCs, each of which would otherwise run the same 5 permission queries; the
 * in-flight promise is cached, so concurrent requests share one resolution.
 * Permission changes take up to 10s to reach cached reads (same trade-off as
 * `resolveBookScopeCached`); write gates (`requirePermission`) stay uncached.
 */
export async function getReadContextCached(
	userId: string,
	serverId: string,
	opts: { isAppOwner: boolean },
): Promise<{
	pc: PermissionContext;
	accessibleLibraryIds: number[] | "ALL";
}> {
	const key = `${userId}:${serverId}:${opts.isAppOwner ? 1 : 0}`;
	return readContextCache.get(key, async () => {
		const pc = await getUserPermissionContext(userId, serverId, opts);
		const accessibleLibraryIds = await getAccessibleLibraryIds(
			userId,
			serverId,
			pc,
		);
		return { pc, accessibleLibraryIds };
	});
}

/**
 * Drops every cached permission resolution (read contexts + media book scopes).
 * Permission-mutating endpoints call this so changes apply on the next request
 * (Discord-style real-time); the TTLs only cover paths that forget to. A full
 * clear is fine — rebuilds are a handful of indexed queries per active user.
 */
export function invalidatePermissionCaches(): void {
	readContextCache.clear();
	bookScopeCache.clear();
}

/** Resolves pc + accessible libraries; null when no authenticated user/active org. */
export async function resolveLibraryAccess(
	session: {
		user?: { id: string; role?: string | null } | null;
		session?: { activeOrganizationId?: string | null } | null;
	} | null,
): Promise<{
	pc: PermissionContext;
	serverId: string;
	accessibleLibraryIds: number[] | "ALL";
} | null> {
	const serverId = session?.session?.activeOrganizationId;
	if (!session?.user || !serverId) return null;
	const pc = await getUserPermissionContext(session.user.id, serverId, {
		isAppOwner: session.user.role === "admin",
	});
	const accessibleLibraryIds = await getAccessibleLibraryIds(
		session.user.id,
		serverId,
		pc,
	);
	return { pc, serverId, accessibleLibraryIds };
}

/** For book read handlers. `scope` is "ALL" when no org; guard on `serverId` if org-scoping is required. */
export async function resolveBookScope(
	session: Parameters<typeof resolveLibraryAccess>[0],
): Promise<{ serverId: string | undefined; scope: number[] | "ALL" }> {
	const access = await resolveLibraryAccess(session);
	// Fail closed: no authenticated user / no active org resolves to an EMPTY
	// scope (no libraries), never "ALL". "ALL" must only ever originate from an
	// actual owner/admin resolution in getAccessibleLibraryIds.
	return {
		serverId: access?.serverId,
		scope: access?.accessibleLibraryIds ?? [],
	};
}

const BOOK_SCOPE_CACHE_TTL_MS = 30_000;
const BOOK_SCOPE_CACHE_MAX = 1000;
const bookScopeCache = new Map<
	string,
	{ value: Awaited<ReturnType<typeof resolveBookScope>>; expiresAt: number }
>();

/**
 * TTL-cached `resolveBookScope` for high-frequency media routes (every seek in
 * the audio player is a new range request). Permission changes take up to 30s
 * to reach streaming; oRPC handlers keep using the uncached resolver.
 */
export async function resolveBookScopeCached(
	session: Parameters<typeof resolveLibraryAccess>[0],
): Promise<{ serverId: string | undefined; scope: number[] | "ALL" }> {
	const userId = session?.user?.id;
	const serverId = session?.session?.activeOrganizationId;
	if (!userId || !serverId) return resolveBookScope(session);

	const key = `${userId}:${serverId}:${session?.user?.role ?? ""}`;
	const now = Date.now();
	const hit = bookScopeCache.get(key);
	if (hit && hit.expiresAt > now) return hit.value;

	const value = await resolveBookScope(session);
	if (bookScopeCache.size >= BOOK_SCOPE_CACHE_MAX) {
		for (const [k, v] of bookScopeCache) {
			if (v.expiresAt <= now) bookScopeCache.delete(k);
		}
		if (bookScopeCache.size >= BOOK_SCOPE_CACHE_MAX) bookScopeCache.clear();
	}
	bookScopeCache.set(key, { value, expiresAt: now + BOOK_SCOPE_CACHE_TTL_MS });
	return value;
}

// Server id for a caller allowed to edit catalog metadata, gated on the global
// `book:editMetadata` perm (catalog edits are server-wide, not per-library).
// null = no active server or not permitted.
export async function resolveServerForCatalogEdit(
	session: Parameters<typeof resolveLibraryAccess>[0],
): Promise<string | null> {
	const access = await resolveLibraryAccess(session);
	if (!access) return null;
	return hasGlobal(access.pc, "book", "editMetadata") ? access.serverId : null;
}

/** Whether the caller may do `resource:action` on a book, via its library's overwrites. */
export async function canAccessBookAction(
	session: {
		user?: { id: string; role?: string | null } | null;
		session?: { activeOrganizationId?: string | null } | null;
	} | null,
	uuid: string,
	resource: Resource,
	action: string,
): Promise<boolean> {
	const serverId = session?.session?.activeOrganizationId;
	if (!session?.user || !serverId) return false;

	const [row] = await db
		.select({
			libraryId: book.libraryId,
			serverId: library.serverId,
		})
		.from(book)
		.innerJoin(library, eq(library.id, book.libraryId))
		.where(eq(book.uuid, uuid))
		.limit(1);
	if (!row || row.libraryId == null || row.serverId !== serverId) return false;

	const pc = await getUserPermissionContext(session.user.id, serverId, {
		isAppOwner: session.user.role === "admin",
	});
	const ov = await getLibraryOverwrites(row.libraryId, session.user.id, pc);
	return can(pc, ov, resource, action);
}

async function getLibraryOverwrites(
	libraryId: number,
	userId: string,
	pc: PermissionContext,
): Promise<LibraryOverwrites> {
	const rows = await fetchRelevantOverwrites(userId, pc, { libraryId });
	return buildLibraryOverwrites(rows, pc.roleIds, userId);
}

// Fan-out resolver (library-update notifications): every member of the server
// who may view the library. Batch: members + roles + overwrites in three
// queries, then the pure per-user resolution in memory.
export async function getUsersWithLibraryAccess(
	libraryId: number,
	serverId: string,
): Promise<string[]> {
	const members = await db
		.select({
			userId: member.userId,
			membershipRole: member.role,
			appRole: user.role,
		})
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, serverId));
	if (members.length === 0) return [];

	const serverRoles = await db
		.select({
			id: role.id,
			position: role.position,
			isDefault: role.isDefault,
			permissions: role.permissions,
		})
		.from(role)
		.where(eq(role.serverId, serverId));
	const assignments = await db
		.select({ userId: memberRole.userId, roleId: memberRole.roleId })
		.from(memberRole)
		.where(eq(memberRole.serverId, serverId));
	const overwrites = await db
		.select({
			libraryId: libraryPermissionOverwrite.libraryId,
			subjectType: libraryPermissionOverwrite.subjectType,
			subjectId: libraryPermissionOverwrite.subjectId,
			allow: libraryPermissionOverwrite.allow,
			deny: libraryPermissionOverwrite.deny,
		})
		.from(libraryPermissionOverwrite)
		.where(eq(libraryPermissionOverwrite.libraryId, libraryId));

	const defaultRoles = serverRoles.filter((r) => r.isDefault);
	const rolesById = new Map(serverRoles.map((r) => [r.id, r]));
	const assignedByUser = new Map<string, RoleInput[]>();
	for (const a of assignments) {
		const assigned = rolesById.get(a.roleId);
		if (!assigned) continue;
		const list = assignedByUser.get(a.userId) ?? [];
		list.push(assigned);
		assignedByUser.set(a.userId, list);
	}

	const allowed: string[] = [];
	for (const m of members) {
		const pc = buildPermissionContext({
			isAppOwner: m.appRole === "admin",
			membershipRole: m.membershipRole,
			roles: [...defaultRoles, ...(assignedByUser.get(m.userId) ?? [])],
		});
		const ov = buildLibraryOverwrites(overwrites, pc.roleIds, m.userId);
		if (can(pc, ov, "library", "view")) allowed.push(m.userId);
	}
	return allowed;
}
