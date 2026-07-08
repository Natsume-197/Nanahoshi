import { randomBytes } from "node:crypto";
import { db } from "@nanahoshi-v2/db";
import { member, organization } from "@nanahoshi-v2/db/schema/auth";
import { book, invitationLink, library } from "@nanahoshi-v2/db/schema/general";
import {
	and,
	count,
	eq,
	gt,
	gte,
	isNotNull,
	isNull,
	lt,
	or,
	sql,
} from "drizzle-orm";

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
		serverId: string;
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
				serverId: data.serverId,
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

	async listByOrg(serverId: string) {
		// Discord-style: dead links (revoked, expired, or out of uses) are
		// purged on listing rather than lingering in the UI forever.
		await db
			.delete(invitationLink)
			.where(
				and(
					eq(invitationLink.serverId, serverId),
					or(
						isNotNull(invitationLink.revokedAt),
						and(
							isNotNull(invitationLink.expiresAt),
							lt(invitationLink.expiresAt, new Date()),
						),
						and(
							isNotNull(invitationLink.maxUses),
							gte(invitationLink.useCount, invitationLink.maxUses),
						),
					),
				),
			);
		return await db
			.select()
			.from(invitationLink)
			.where(eq(invitationLink.serverId, serverId))
			.orderBy(invitationLink.createdAt);
	}

	async incrementUseCount(id: string) {
		await db
			.update(invitationLink)
			.set({ useCount: sql`${invitationLink.useCount} + 1` })
			.where(eq(invitationLink.id, id));
	}

	async consumeUse(id: string) {
		const [updated] = await db
			.update(invitationLink)
			.set({ useCount: sql`${invitationLink.useCount} + 1` })
			.where(
				and(
					eq(invitationLink.id, id),
					isNull(invitationLink.revokedAt),
					or(
						isNull(invitationLink.expiresAt),
						gt(invitationLink.expiresAt, new Date()),
					),
					or(
						isNull(invitationLink.maxUses),
						sql`${invitationLink.useCount} < ${invitationLink.maxUses}`,
					),
				),
			)
			.returning();
		return updated ?? null;
	}

	async releaseUse(id: string) {
		await db
			.update(invitationLink)
			.set({
				useCount: sql`GREATEST(${invitationLink.useCount} - 1, 0)`,
			})
			.where(eq(invitationLink.id, id));
	}

	async delete(id: string, serverId: string) {
		const [deleted] = await db
			.delete(invitationLink)
			.where(
				and(eq(invitationLink.id, id), eq(invitationLink.serverId, serverId)),
			)
			.returning();
		return deleted ?? null;
	}

	async getServerPreview(serverId: string) {
		const [org] = await db
			.select({
				name: organization.name,
				logo: organization.logo,
				background: organization.background,
			})
			.from(organization)
			.where(eq(organization.id, serverId));
		if (!org) return null;

		const [members] = await db
			.select({ value: count() })
			.from(member)
			.where(eq(member.organizationId, serverId));

		const [books] = await db
			.select({ value: count() })
			.from(book)
			.innerJoin(library, eq(book.libraryId, library.id))
			.where(
				and(eq(library.serverId, serverId), isNull(book.duplicateOfBookId)),
			);

		return {
			name: org.name,
			logo: org.logo,
			background: org.background,
			memberCount: members?.value ?? 0,
			bookCount: books?.value ?? 0,
		};
	}

	async isMember(userId: string, serverId: string) {
		const [existing] = await db
			.select()
			.from(member)
			.where(
				and(eq(member.userId, userId), eq(member.organizationId, serverId)),
			);
		return !!existing;
	}
}

export const inviteLinkRepository = new InviteLinkRepository();
