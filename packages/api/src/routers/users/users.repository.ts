import { db } from "@nanahoshi-v2/db";
import { member, user } from "@nanahoshi-v2/db/schema/auth";
import { and, asc, eq, ilike, ne, or } from "drizzle-orm";
import { resolveAvatarSql } from "../_shared/profile-resolve";

export class UsersRepository {
	/** Members of `serverId` whose username/name matches, excluding the viewer. */
	async search(query: string, serverId: string, viewerId: string, limit = 5) {
		const pattern = `%${query}%`;
		return db
			.select({
				id: user.id,
				name: user.name,
				username: user.username,
				displayUsername: user.displayUsername,
				image: resolveAvatarSql(serverId),
			})
			.from(member)
			.innerJoin(user, eq(user.id, member.userId))
			.where(
				and(
					eq(member.organizationId, serverId),
					ne(user.id, viewerId),
					or(
						ilike(user.username, pattern),
						ilike(user.name, pattern),
						ilike(user.displayUsername, pattern),
					),
				),
			)
			.orderBy(asc(user.name))
			.limit(limit);
	}

	async getLastActiveOrg(userId: string): Promise<string | null> {
		const [result] = await db
			.select({ lastActiveOrganizationId: user.lastActiveOrganizationId })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);
		return result?.lastActiveOrganizationId ?? null;
	}

	async setLastActiveOrg(userId: string, orgId: string | null) {
		await db
			.update(user)
			.set({ lastActiveOrganizationId: orgId })
			.where(eq(user.id, userId));
	}

	async getRole(userId: string, orgId: string): Promise<string | null> {
		const [membership] = await db
			.select({ role: member.role })
			.from(member)
			.where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
			.limit(1);
		return membership?.role ?? null;
	}
}

export const usersRepository = new UsersRepository();
