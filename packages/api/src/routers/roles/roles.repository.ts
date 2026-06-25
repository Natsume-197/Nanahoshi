import { randomBytes } from "node:crypto";
import { db } from "@nanahoshi-v2/db";
import { member } from "@nanahoshi-v2/db/schema/auth";
import { memberRole, role } from "@nanahoshi-v2/db/schema/general";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { PermissionMap } from "../../auth/permissions.catalog";

function generateId(): string {
	return randomBytes(16).toString("hex");
}

const roleColumns = {
	id: role.id,
	name: role.name,
	color: role.color,
	position: role.position,
	isDefault: role.isDefault,
	permissions: role.permissions,
};

export type RoleRow = {
	id: string;
	name: string;
	color: string | null;
	position: number;
	isDefault: boolean;
	permissions: PermissionMap;
};

export type RoleWithCount = RoleRow & { memberCount: number };

export class RolesRepository {
	/** Highest position first. @everyone's count is the org's total membership (it applies implicitly). */
	async list(serverId: string): Promise<RoleWithCount[]> {
		const rows = await db
			.select({ ...roleColumns, memberCount: count(memberRole.userId) })
			.from(role)
			.leftJoin(memberRole, eq(memberRole.roleId, role.id))
			.where(eq(role.serverId, serverId))
			.groupBy(role.id)
			.orderBy(desc(role.position));

		const [totalMembers] = await db
			.select({ value: count() })
			.from(member)
			.where(eq(member.organizationId, serverId));

		return rows.map((r) => ({
			...r,
			memberCount: r.isDefault ? (totalMembers?.value ?? 0) : r.memberCount,
		}));
	}

	async getById(id: string, serverId: string): Promise<RoleRow | null> {
		const [r] = await db
			.select(roleColumns)
			.from(role)
			.where(and(eq(role.id, id), eq(role.serverId, serverId)))
			.limit(1);
		return r ?? null;
	}

	async maxPosition(serverId: string): Promise<number> {
		const rows = await db
			.select({ position: role.position })
			.from(role)
			.where(eq(role.serverId, serverId));
		return rows.reduce((max, r) => Math.max(max, r.position), 0);
	}

	async create(input: {
		serverId: string;
		name: string;
		color: string | null;
		position: number;
		permissions: PermissionMap;
	}): Promise<RoleRow> {
		const id = generateId();
		await db.insert(role).values({
			id,
			serverId: input.serverId,
			name: input.name,
			color: input.color,
			position: input.position,
			isDefault: false,
			permissions: input.permissions,
		});
		const created = await this.getById(id, input.serverId);
		if (!created) throw new Error("Failed to create role");
		return created;
	}

	async update(
		id: string,
		serverId: string,
		patch: {
			name?: string;
			color?: string | null;
			position?: number;
			permissions?: PermissionMap;
		},
	): Promise<RoleRow | null> {
		const set: Record<string, unknown> = {
			updatedAt: new Date().toISOString(),
		};
		if (patch.name !== undefined) set.name = patch.name;
		if (patch.color !== undefined) set.color = patch.color;
		if (patch.position !== undefined) set.position = patch.position;
		if (patch.permissions !== undefined) set.permissions = patch.permissions;
		await db
			.update(role)
			.set(set)
			.where(and(eq(role.id, id), eq(role.serverId, serverId)));
		return this.getById(id, serverId);
	}

	async delete(id: string, serverId: string): Promise<boolean> {
		const deleted = await db
			.delete(role)
			.where(and(eq(role.id, id), eq(role.serverId, serverId)));
		return (deleted.rowCount ?? 0) > 0;
	}

	/** `orderedIds` is highest-first; @everyone (isDefault) is never touched. */
	async reorder(serverId: string, orderedIds: string[]): Promise<void> {
		await db.transaction(async (tx) => {
			let position = orderedIds.length;
			for (const id of orderedIds) {
				await tx
					.update(role)
					.set({ position, updatedAt: new Date().toISOString() })
					.where(
						and(
							eq(role.id, id),
							eq(role.serverId, serverId),
							eq(role.isDefault, false),
						),
					);
				position -= 1;
			}
		});
	}

	async listAssignments(serverId: string): Promise<Record<string, string[]>> {
		const rows = await db
			.select({ userId: memberRole.userId, roleId: memberRole.roleId })
			.from(memberRole)
			.where(eq(memberRole.serverId, serverId));
		const out: Record<string, string[]> = {};
		for (const r of rows) {
			const list = out[r.userId] ?? [];
			list.push(r.roleId);
			out[r.userId] = list;
		}
		return out;
	}

	async setMemberRoles(
		userId: string,
		serverId: string,
		roleIds: string[],
	): Promise<void> {
		await db.transaction(async (tx) => {
			await tx
				.delete(memberRole)
				.where(
					and(eq(memberRole.userId, userId), eq(memberRole.serverId, serverId)),
				);
			if (roleIds.length > 0) {
				await tx.insert(memberRole).values(
					roleIds.map((roleId) => ({
						userId,
						roleId,
						serverId,
					})),
				);
			}
		});
	}

	async assignableRolesByIds(
		roleIds: string[],
		serverId: string,
	): Promise<RoleRow[]> {
		if (roleIds.length === 0) return [];
		return db
			.select(roleColumns)
			.from(role)
			.where(and(eq(role.serverId, serverId), inArray(role.id, roleIds)));
	}

	async isMember(userId: string, serverId: string): Promise<boolean> {
		const [m] = await db
			.select({ id: member.id })
			.from(member)
			.where(
				and(eq(member.userId, userId), eq(member.organizationId, serverId)),
			)
			.limit(1);
		return !!m;
	}
}

export const rolesRepository = new RolesRepository();
