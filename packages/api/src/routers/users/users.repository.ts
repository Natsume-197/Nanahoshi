import { db } from "@nanahoshi-v2/db";
import { member, user } from "@nanahoshi-v2/db/schema/auth";
import { and, eq } from "drizzle-orm";

export class UsersRepository {
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
