import { db } from "@nanahoshi-v2/db";
import { userSettings } from "@nanahoshi-v2/db/schema/general";
import { and, eq } from "drizzle-orm";

export class UserSettingsRepository {
	async get(
		userId: string,
		key: string,
	): Promise<{ value: unknown; updatedAt: Date } | null> {
		const [row] = await db
			.select({ value: userSettings.value, updatedAt: userSettings.updatedAt })
			.from(userSettings)
			.where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
			.limit(1);
		return row ?? null;
	}

	/** Insert or update the JSON value for a user's settings key. */
	async upsert(userId: string, key: string, value: unknown) {
		await db
			.insert(userSettings)
			.values({ userId, key, value })
			.onConflictDoUpdate({
				target: [userSettings.userId, userSettings.key],
				set: { value, updatedAt: new Date() },
			});
	}
}

export const userSettingsRepository = new UserSettingsRepository();
