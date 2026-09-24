import { db } from "@nanahoshi/db";
import { member, organization, user } from "@nanahoshi/db/schema/auth";
import { book, library } from "@nanahoshi/db/schema/general";
import { count, eq } from "drizzle-orm";
import { readingSessionsRepository } from "../reading-sessions/reading-sessions.repository";

export class AdminRepository {
	async getSystemCounts() {
		const [users, orgs, books, libraries] = await Promise.all([
			db.select({ count: count() }).from(user),
			db.select({ count: count() }).from(organization),
			db.select({ count: count() }).from(book),
			db.select({ count: count() }).from(library),
		]);

		return {
			userCount: users[0]?.count ?? 0,
			organizationCount: orgs[0]?.count ?? 0,
			bookCount: books[0]?.count ?? 0,
			libraryCount: libraries[0]?.count ?? 0,
		};
	}

	async listUsers() {
		return db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				image: user.image,
				role: user.role,
				banned: user.banned,
				banReason: user.banReason,
				createdAt: user.createdAt,
			})
			.from(user);
	}

	async banUser(userId: string, reason?: string) {
		await db
			.update(user)
			.set({ banned: true, banReason: reason ?? null })
			.where(eq(user.id, userId));
	}

	async unbanUser(userId: string) {
		await db
			.update(user)
			.set({ banned: false, banReason: null, banExpires: null })
			.where(eq(user.id, userId));
	}

	async deleteUser(userId: string) {
		await db.delete(user).where(eq(user.id, userId));
	}

	async setUserRole(userId: string, role: "user" | "admin") {
		await db.update(user).set({ role }).where(eq(user.id, userId));
	}

	async listServers() {
		return db.select().from(organization);
	}

	async createServer(
		id: string,
		name: string,
		slug: string,
		creatorId: string,
	) {
		await db.transaction(async (tx) => {
			await tx.insert(organization).values({
				id,
				name,
				slug,
				createdAt: new Date(),
			});

			await tx.insert(member).values({
				id: crypto.randomUUID(),
				organizationId: id,
				userId: creatorId,
				role: "owner",
				createdAt: new Date(),
			});
		});
	}

	async deleteServer(orgId: string) {
		await db.transaction(async (tx) => {
			await readingSessionsRepository.deleteForServer(tx, orgId);
			await tx.delete(organization).where(eq(organization.id, orgId));
		});
	}

	async getOrgWithMembers(orgId: string) {
		const org = await db
			.select()
			.from(organization)
			.where(eq(organization.id, orgId))
			.limit(1);

		if (org.length === 0) return null;

		const members = await db
			.select({
				id: member.id,
				role: member.role,
				createdAt: member.createdAt,
				userId: member.userId,
				userName: user.name,
				userEmail: user.email,
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, orgId));

		return { ...org[0], members };
	}

	async removeMember(memberId: string) {
		await db.delete(member).where(eq(member.id, memberId));
	}

	async updateMemberRole(memberId: string, role: string) {
		await db.update(member).set({ role }).where(eq(member.id, memberId));
	}
}

export const adminRepository = new AdminRepository();
