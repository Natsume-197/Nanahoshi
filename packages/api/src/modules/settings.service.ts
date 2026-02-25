import { eq } from "drizzle-orm";
import { db } from "../../core/database/db.client";
import { appSettings } from "../../core/database/schema/general";

let cachedSetup: boolean | null = null;

export async function isAppConfigured() {
	if (cachedSetup !== null) return cachedSetup;

	const result = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, "first_setup"))
		.limit(1);

	cachedSetup = result.length > 0 && result[0].value === true;
	return cachedSetup;
}

export async function markAppConfigured() {
	await db
		.update(appSettings)
		.set({ value: true })
		.where(eq(appSettings.key, "first_setup"));
	cachedSetup = true;
}
