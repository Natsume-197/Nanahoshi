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

export const rolesRepository = {
	/** Highest position first. @everyone's count is the org's total membership (it applies implicitly). */
	async list(organizationId: string): Promise<RoleWithCount[]> {
		const rows = await db
			.select({ ...roleColumns, memberCount: count(memberRole.userId) })
			.from(role)
			.leftJoin(memberRole, eq(memberRole.roleId, role.id))
			.where(eq(role.organizationId, organizationId))
			.groupBy(role.id)
			.orderBy(desc(role.position));

		const [totalMembers] = await db
			.select({ value: count() })
			.from(member)
			.where(eq(member.organizationId, organizationId));

		return rows.map((r) => ({
			...r,
			memberCount: r.isDefault ? (totalMembers?.value ?? 0) : r.memberCount,
		}));
	},

	async getById(id: string, organizationId: string): Promise<RoleRow | null> {
		const [r] = await db
			.select(roleColumns)
			.from(role)
			.where(and(eq(role.id, id), eq(role.organizationId, organizationId)))
			.limit(1);
		return r ?? null;
	},

	async maxPosition(organizationId: string): Promise<number> {
		const rows = await db
			.select({ position: role.position })
			.from(role)
			.where(eq(role.organizationId, organizationId));
		return rows.reduce((max, r) => Math.max(max, r.position), 0);
	},

	async create(input: {
		organizationId: string;
		name: string;
		color: string | null;
		position: number;
		permissions: PermissionMap;
	}): Promise<RoleRow> {
		const id = generateId();
		await db.insert(role).values({
			id,
			organizationId: input.organizationId,
			name: input.name,
			color: input.color,
			position: input.position,
			isDefault: false,
			permissions: input.permissions,
		});
		const created = await this.getById(id, input.organizationId);
		if (!created) throw new Error("Failed to create role");
		return created;
	},

	async update(
		id: string,
		organizationId: string,
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
			.where(and(eq(role.id, id), eq(role.organizationId, organizationId)));
		return this.getById(id, organizationId);
	},

	async delete(id: string, organizationId: string): Promise<boolean> {
		const deleted = await db
			.delete(role)
			.where(and(eq(role.id, id), eq(role.organizationId, organizationId)));
		return (deleted.rowCount ?? 0) > 0;
	},

	/** `orderedIds` is highest-first; @everyone (isDefault) is never touched. */
	async reorder(organizationId: string, orderedIds: string[]): Promise<void> {
		await db.transaction(async (tx) => {
			let position = orderedIds.length;
			for (const id of orderedIds) {
				await tx
					.update(role)
					.set({ position, updatedAt: new Date().toISOString() })
					.where(
						and(
							eq(role.id, id),
							eq(role.organizationId, organizationId),
							eq(role.isDefault, false),
						),
					);
				position -= 1;
			}
		});
	},

	async listAssignments(
		organizationId: string,
	): Promise<Record<string, string[]>> {
		const rows = await db
			.select({ userId: memberRole.userId, roleId: memberRole.roleId })
			.from(memberRole)
			.where(eq(memberRole.organizationId, organizationId));
		const out: Record<string, string[]> = {};
		for (const r of rows) {
			const list = out[r.userId] ?? [];
			list.push(r.roleId);
			out[r.userId] = list;
		}
		return out;
	},

	async setMemberRoles(
		userId: string,
		organizationId: string,
		roleIds: string[],
	): Promise<void> {
		await db.transaction(async (tx) => {
			await tx
				.delete(memberRole)
				.where(
					and(
						eq(memberRole.userId, userId),
						eq(memberRole.organizationId, organizationId),
					),
				);
			if (roleIds.length > 0) {
				await tx.insert(memberRole).values(
					roleIds.map((roleId) => ({
						userId,
						roleId,
						organizationId,
					})),
				);
			}
		});
	},

	async assignableRolesByIds(
		roleIds: string[],
		organizationId: string,
	): Promise<RoleRow[]> {
		if (roleIds.length === 0) return [];
		return db
			.select(roleColumns)
			.from(role)
			.where(
				and(eq(role.organizationId, organizationId), inArray(role.id, roleIds)),
			);
	},

	async isMember(userId: string, organizationId: string): Promise<boolean> {
		const [m] = await db
			.select({ id: member.id })
			.from(member)
			.where(
				and(
					eq(member.userId, userId),
					eq(member.organizationId, organizationId),
				),
			)
			.limit(1);
		return !!m;
	},
};
