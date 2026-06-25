import { db } from "@nanahoshi-v2/db";
import { discordAccessRule } from "@nanahoshi-v2/db/schema/general";
import { and, eq } from "drizzle-orm";

export class DiscordRulesRepository {
	async listByOrg(orgId: string) {
		return db
			.select()
			.from(discordAccessRule)
			.where(eq(discordAccessRule.serverId, orgId))
			.orderBy(discordAccessRule.createdAt);
	}

	async create(values: {
		id: string;
		serverId: string;
		guildId: string;
		roleId: string | null;
		label: string | null;
		enabled: boolean;
	}) {
		const [created] = await db
			.insert(discordAccessRule)
			.values(values)
			.returning();
		return created;
	}

	async deleteByIdAndOrg(id: string, orgId: string) {
		const [deleted] = await db
			.delete(discordAccessRule)
			.where(
				and(
					eq(discordAccessRule.id, id),
					eq(discordAccessRule.serverId, orgId),
				),
			)
			.returning();
		return deleted ?? null;
	}

	async setEnabled(id: string, orgId: string, enabled: boolean) {
		const [updated] = await db
			.update(discordAccessRule)
			.set({ enabled })
			.where(
				and(
					eq(discordAccessRule.id, id),
					eq(discordAccessRule.serverId, orgId),
				),
			)
			.returning();
		return updated ?? null;
	}
}

export const discordRulesRepository = new DiscordRulesRepository();
