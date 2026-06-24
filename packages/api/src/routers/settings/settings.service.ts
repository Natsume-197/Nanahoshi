import { settingsRepository } from "./settings.repository";

let cachedSetup: boolean | null = null;

export async function isAppConfigured() {
	if (cachedSetup !== null) return cachedSetup;

	const value = await settingsRepository.getValue<boolean>("first_setup");
	cachedSetup = value === true;
	return cachedSetup;
}

export async function markAppConfigured() {
	await settingsRepository.setValue("first_setup", true);
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
	const value =
		await settingsRepository.getValue<Partial<AmazonConfig>>("amazon");
	if (!value) {
		return DEFAULT_AMAZON_CONFIG;
	}

	return {
		...DEFAULT_AMAZON_CONFIG,
		...value,
	};
}

// ─── RanobeDB Configuration ──────────────────────────────

export type RanobedbConfig = {
	enabled: boolean;
	autoUpdate: boolean;
	lastImportedAt?: string;
};

const DEFAULT_RANOBEDB_CONFIG: RanobedbConfig = {
	enabled: true,
	autoUpdate: false,
};

export async function getRanobedbConfig(): Promise<RanobedbConfig> {
	const value =
		await settingsRepository.getValue<Partial<RanobedbConfig>>("ranobedb");
	if (!value) {
		return DEFAULT_RANOBEDB_CONFIG;
	}

	return {
		...DEFAULT_RANOBEDB_CONFIG,
		...value,
	};
}

export async function setRanobedbConfig(
	patch: Partial<RanobedbConfig>,
): Promise<RanobedbConfig> {
	const merged = { ...(await getRanobedbConfig()), ...patch };
	await settingsRepository.upsert("ranobedb", merged);
	return merged;
}
