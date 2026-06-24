import { db } from "@nanahoshi-v2/db";
import { appSettings } from "@nanahoshi-v2/db/schema/general";
import { eq } from "drizzle-orm";

export class SettingsRepository {
	async getValue<T = unknown>(key: string): Promise<T | undefined> {
		const [row] = await db
			.select({ value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, key))
			.limit(1);
		return row?.value as T | undefined;
	}

	async setValue(key: string, value: unknown) {
		await db.update(appSettings).set({ value }).where(eq(appSettings.key, key));
	}

	/** Insert or update the JSON value for a settings key. */
	async upsert(key: string, value: unknown) {
		const [existing] = await db
			.select({ id: appSettings.id })
			.from(appSettings)
			.where(eq(appSettings.key, key))
			.limit(1);

		if (existing) {
			await db
				.update(appSettings)
				.set({ value, updatedAt: new Date() })
				.where(eq(appSettings.key, key));
		} else {
			await db.insert(appSettings).values({ key, value });
		}
	}
}

export const settingsRepository = new SettingsRepository();
