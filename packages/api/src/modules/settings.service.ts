import { db } from "@nanahoshi-v2/db";
import { appSettings } from "@nanahoshi-v2/db/schema/general";
import { eq } from "drizzle-orm";

let cachedSetup: boolean | null = null;

export async function isAppConfigured() {
	if (cachedSetup !== null) return cachedSetup;

	const result = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, "first_setup"))
		.limit(1);

	cachedSetup = result[0]?.value === true;
	return cachedSetup;
}

export async function markAppConfigured() {
	await db
		.update(appSettings)
		.set({ value: true })
		.where(eq(appSettings.key, "first_setup"));
	cachedSetup = true;
}

// ─── Amazon Configuration ────────────────────────────────

export type AmazonConfig = {
	domain: string;
	cookie?: string;
	enabled: boolean;
};

const DEFAULT_AMAZON_CONFIG: AmazonConfig = {
	domain: "co.jp",
	enabled: true,
};

export async function getAmazonConfig(): Promise<AmazonConfig> {
	const result = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, "amazon"))
		.limit(1);

	const row = result[0];
	if (!row) {
		return DEFAULT_AMAZON_CONFIG;
	}

	return {
		...DEFAULT_AMAZON_CONFIG,
		...(row.value as Partial<AmazonConfig>),
	};
}
