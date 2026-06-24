import { db } from "@nanahoshi-v2/db";
import { account } from "@nanahoshi-v2/db/schema/auth";
import { discordAccessRule } from "@nanahoshi-v2/db/schema/general";
import { and, eq } from "drizzle-orm";

export class DiscordAccessRepository {
	async updateAccountTokens(
		accountId: string,
		tokens: {
			accessToken: string;
			refreshToken: string;
			accessTokenExpiresAt: Date;
		},
	) {
		await db
			.update(account)
			.set({
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken,
				accessTokenExpiresAt: tokens.accessTokenExpiresAt,
			})
			.where(eq(account.id, accountId));
	}

	async getDiscordAccount(userId: string) {
		const [discordAccount] = await db
			.select({
				id: account.id,
				accessToken: account.accessToken,
				refreshToken: account.refreshToken,
				accessTokenExpiresAt: account.accessTokenExpiresAt,
			})
			.from(account)
			.where(and(eq(account.userId, userId), eq(account.providerId, "discord")))
			.limit(1);
		return discordAccount ?? null;
	}

	async getEnabledRules(orgId: string) {
		return db
			.select()
			.from(discordAccessRule)
			.where(
				and(
					eq(discordAccessRule.organizationId, orgId),
					eq(discordAccessRule.enabled, true),
				),
			);
	}
}

export const discordAccessRepository = new DiscordAccessRepository();
