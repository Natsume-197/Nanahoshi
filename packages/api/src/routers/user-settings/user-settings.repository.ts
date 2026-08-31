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

	/** Compare-and-swap a setting using the server-authored updatedAt revision. */
	async upsert(
		userId: string,
		key: string,
		value: unknown,
		expectedUpdatedAt?: Date | null,
	): Promise<{ updatedAt: Date } | null> {
		if (expectedUpdatedAt === null) {
			const [created] = await db
				.insert(userSettings)
				.values({ userId, key, value })
				.onConflictDoNothing({
					target: [userSettings.userId, userSettings.key],
				})
				.returning({ updatedAt: userSettings.updatedAt });
			return created ?? null;
		}

		if (expectedUpdatedAt) {
			const [updated] = await db
				.update(userSettings)
				.set({ value, updatedAt: new Date() })
				.where(
					and(
						eq(userSettings.userId, userId),
						eq(userSettings.key, key),
						eq(userSettings.updatedAt, expectedUpdatedAt),
					),
				)
				.returning({ updatedAt: userSettings.updatedAt });
			return updated ?? null;
		}

		await db
			.insert(userSettings)
			.values({ userId, key, value })
			.onConflictDoUpdate({
				target: [userSettings.userId, userSettings.key],
				set: { value, updatedAt: new Date() },
			});
		return this.get(userId, key);
	}
}

export const userSettingsRepository = new UserSettingsRepository();
