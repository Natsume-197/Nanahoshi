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

// The ranobedb provider reads this config on every book it enriches, so cache
// it (short TTL) to avoid a settings query per book. Every write goes through
// setRanobedbConfig below, which refreshes the cache immediately.
let ranobedbCache: { value: RanobedbConfig; at: number } | null = null;
const RANOBEDB_CACHE_TTL_MS = 60_000;

export async function getRanobedbConfig(): Promise<RanobedbConfig> {
	const now = Date.now();
	if (ranobedbCache && now - ranobedbCache.at < RANOBEDB_CACHE_TTL_MS) {
		return ranobedbCache.value;
	}

	const value =
		await settingsRepository.getValue<Partial<RanobedbConfig>>("ranobedb");
	const config: RanobedbConfig = value
		? { ...DEFAULT_RANOBEDB_CONFIG, ...value }
		: { ...DEFAULT_RANOBEDB_CONFIG };
	ranobedbCache = { value: config, at: now };
	return config;
}

export async function setRanobedbConfig(
	patch: Partial<RanobedbConfig>,
): Promise<RanobedbConfig> {
	const merged = { ...(await getRanobedbConfig()), ...patch };
	await settingsRepository.upsert("ranobedb", merged);
	ranobedbCache = { value: merged, at: Date.now() };
	return merged;
}
