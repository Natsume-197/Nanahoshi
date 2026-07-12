import { db } from "@nanahoshi-v2/db";
import {
	appSettings,
	organizationSettings,
} from "@nanahoshi-v2/db/schema/general";
import { and, eq } from "drizzle-orm";

export class SettingsRepository {
	// ---------- Instance-global settings (app_settings) ----------
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
		await db
			.insert(appSettings)
			.values({ key, value })
			.onConflictDoUpdate({
				target: [appSettings.key],
				set: { value, updatedAt: new Date() },
			});
	}

	// ---------- Per-organization settings (organization_settings) ----------
	async getOrgValue<T = unknown>(
		serverId: string,
		key: string,
	): Promise<T | undefined> {
		const [row] = await db
			.select({ value: organizationSettings.value })
			.from(organizationSettings)
			.where(
				and(
					eq(organizationSettings.serverId, serverId),
					eq(organizationSettings.key, key),
				),
			)
			.limit(1);
		return row?.value as T | undefined;
	}

	/** Insert or update the JSON value for an organization's settings key. */
	async upsertOrgValue(serverId: string, key: string, value: unknown) {
		await db
			.insert(organizationSettings)
			.values({ serverId, key, value })
			.onConflictDoUpdate({
				target: [organizationSettings.serverId, organizationSettings.key],
				set: { value, updatedAt: new Date() },
			});
	}
}

export const settingsRepository = new SettingsRepository();
