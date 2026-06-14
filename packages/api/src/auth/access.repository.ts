import { randomBytes } from "node:crypto";
import { db } from "@nanahoshi-v2/db";
import { member } from "@nanahoshi-v2/db/schema/auth";
import {
	book,
	library,
	libraryPermissionOverwrite,
	memberRole,
	role,
} from "@nanahoshi-v2/db/schema/general";
import { and, eq, inArray, or } from "drizzle-orm";
import {
	buildLibraryOverwrites,
	buildPermissionContext,
	can,
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
export async function ensureDefaultRole(organizationId: string) {
	const [existing] = await db
		.select({ id: role.id })
		.from(role)
		.where(
			and(eq(role.organizationId, organizationId), eq(role.isDefault, true)),
		)
		.limit(1);
	if (existing) return existing.id;

	const id = generateId();
	await db.insert(role).values({
		id,
		organizationId,
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
		.selectDistinct({ organizationId: member.organizationId })
		.from(member);
	for (const { organizationId } of orgs) {
		await ensureDefaultRole(organizationId);
	}
}

export async function getUserPermissionContext(
	userId: string,
	organizationId: string,
	opts: { isAppOwner: boolean },
): Promise<PermissionContext> {
	const [membership] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
		)
		.limit(1);

	const defaultRoles = await db
		.select({
			id: role.id,
			position: role.position,
			isDefault: role.isDefault,
			permissions: role.permissions,
		})
		.from(role)
		.where(
			and(eq(role.organizationId, organizationId), eq(role.isDefault, true)),
		);

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
			and(
				eq(memberRole.userId, userId),
				eq(memberRole.organizationId, organizationId),
			),
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
	scope: { organizationId: string } | { libraryId: number },
): Promise<OverwriteInput[]> {
	const scopeFilter =
		"organizationId" in scope
			? eq(libraryPermissionOverwrite.organizationId, scope.organizationId)
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
	organizationId: string,
	pc: PermissionContext,
): Promise<number[] | "ALL"> {
	if (pc.isAppOwner || pc.isOrgOwner || pc.hasAdministrator) return "ALL";

	const libs = await db
		.select({ id: library.id })
		.from(library)
		.where(eq(library.organizationId, organizationId));
	if (libs.length === 0) return [];

	const overwrites = await fetchRelevantOverwrites(userId, pc, {
		organizationId,
	});
	return resolveAccessibleLibraryIds(
		pc,
		libs.map((l) => l.id),
		overwrites,
		userId,
	);
}

/** Resolves pc + accessible libraries; null when no authenticated user/active org. */
export async function resolveLibraryAccess(
	session: {
		user?: { id: string; role?: string | null } | null;
		session?: { activeOrganizationId?: string | null } | null;
	} | null,
): Promise<{
	pc: PermissionContext;
	organizationId: string;
	accessibleLibraryIds: number[] | "ALL";
} | null> {
	const organizationId = session?.session?.activeOrganizationId;
	if (!session?.user || !organizationId) return null;
	const pc = await getUserPermissionContext(session.user.id, organizationId, {
		isAppOwner: session.user.role === "admin",
	});
	const accessibleLibraryIds = await getAccessibleLibraryIds(
		session.user.id,
		organizationId,
		pc,
	);
	return { pc, organizationId, accessibleLibraryIds };
}

/** For book read handlers. `scope` is "ALL" when no org; guard on `organizationId` if org-scoping is required. */
export async function resolveBookScope(
	session: Parameters<typeof resolveLibraryAccess>[0],
): Promise<{ organizationId: string | undefined; scope: number[] | "ALL" }> {
	const access = await resolveLibraryAccess(session);
	return {
		organizationId: access?.organizationId,
		scope: access?.accessibleLibraryIds ?? "ALL",
	};
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
	const organizationId = session?.session?.activeOrganizationId;
	if (!session?.user || !organizationId) return false;

	const [row] = await db
		.select({
			libraryId: book.libraryId,
			organizationId: library.organizationId,
		})
		.from(book)
		.innerJoin(library, eq(library.id, book.libraryId))
		.where(eq(book.uuid, uuid))
		.limit(1);
	if (!row || row.libraryId == null || row.organizationId !== organizationId)
		return false;

	const pc = await getUserPermissionContext(session.user.id, organizationId, {
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
