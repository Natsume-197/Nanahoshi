import { randomBytes } from "node:crypto";
import { db } from "@nanahoshi-v2/db";
import { member } from "@nanahoshi-v2/db/schema/auth";
import { invitationLink } from "@nanahoshi-v2/db/schema/general";
import { and, eq, sql } from "drizzle-orm";

function generateId(): string {
	return randomBytes(16).toString("hex");
}

function generateCode(length = 10): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const bytes = randomBytes(length);
	return Array.from(bytes)
		.map((b) => chars[b % chars.length])
		.join("");
}

export class InviteLinkRepository {
	async create(data: {
		organizationId: string;
		role: string;
		maxUses: number | null;
		expiresAt: Date | null;
		createdBy: string;
	}) {
		const [created] = await db
			.insert(invitationLink)
			.values({
				id: generateId(),
				code: generateCode(),
				organizationId: data.organizationId,
				role: data.role,
				maxUses: data.maxUses,
				useCount: 0,
				createdBy: data.createdBy,
				expiresAt: data.expiresAt,
				revokedAt: null,
			})
			.returning();
		if (!created) throw new Error("Failed to create invitation link");
		return created;
	}

	async findByCode(code: string) {
		const [link] = await db
			.select()
			.from(invitationLink)
			.where(eq(invitationLink.code, code));
		return link ?? null;
	}

	async listByOrg(organizationId: string) {
		return await db
			.select()
			.from(invitationLink)
			.where(eq(invitationLink.organizationId, organizationId))
			.orderBy(invitationLink.createdAt);
	}

	async incrementUseCount(id: string) {
		await db
			.update(invitationLink)
			.set({ useCount: sql`${invitationLink.useCount} + 1` })
			.where(eq(invitationLink.id, id));
	}

	async revoke(id: string, organizationId: string) {
		const [updated] = await db
			.update(invitationLink)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(invitationLink.id, id),
					eq(invitationLink.organizationId, organizationId),
				),
			)
			.returning();
		return updated ?? null;
	}

	async isMember(userId: string, organizationId: string) {
		const [existing] = await db
			.select()
			.from(member)
			.where(
				and(
					eq(member.userId, userId),
					eq(member.organizationId, organizationId),
				),
			);
		return !!existing;
	}
}

export const inviteLinkRepository = new InviteLinkRepository();
