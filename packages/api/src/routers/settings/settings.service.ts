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

// ─── Amazon Configuration (per-organization) ─────────────
// Domain + cookie are tenant-scoped: the cookie is a tenant's own Amazon
// session credential and must never be shared across organizations.

export type AmazonConfig = {
	domain: string;
	cookie?: string;
	enabled: boolean;
};

const DEFAULT_AMAZON_CONFIG: AmazonConfig = {
	domain: "co.jp",
	enabled: true,
};

export async function getAmazonConfig(serverId: string): Promise<AmazonConfig> {
	const value = await settingsRepository.getOrgValue<Partial<AmazonConfig>>(
		serverId,
		"amazon",
	);
	if (!value) return DEFAULT_AMAZON_CONFIG;
	return { ...DEFAULT_AMAZON_CONFIG, ...value };
}

export async function setAmazonConfig(
	serverId: string,
	patch: Partial<AmazonConfig>,
): Promise<AmazonConfig> {
	const merged = { ...(await getAmazonConfig(serverId)), ...patch };
	await settingsRepository.upsertOrgValue(serverId, "amazon", merged);
	return merged;
}

// ─── RanobeDB Configuration ──────────────────────────────
// Split by scope: the dump import (autoUpdate/lastImportedAt) is a single
// shared physical database, so it stays instance-global; whether the provider
// is enabled is a per-organization choice.

export type RanobedbOrgConfig = {
	enabled: boolean;
};

export type RanobedbDumpConfig = {
	autoUpdate: boolean;
	lastImportedAt?: string;
};

const DEFAULT_RANOBEDB_ORG_CONFIG: RanobedbOrgConfig = {
	enabled: true,
};

const DEFAULT_RANOBEDB_DUMP_CONFIG: RanobedbDumpConfig = {
	autoUpdate: false,
};

// Read on every book during enrich, so cache per-org; setRanobedbConfig refreshes.
const ranobedbOrgCache = new Map<
	string,
	{ value: RanobedbOrgConfig; at: number }
>();
const RANOBEDB_CACHE_TTL_MS = 60_000;

export async function getRanobedbConfig(
	serverId: string,
): Promise<RanobedbOrgConfig> {
	const now = Date.now();
	const cached = ranobedbOrgCache.get(serverId);
	if (cached && now - cached.at < RANOBEDB_CACHE_TTL_MS) {
		return cached.value;
	}

	const value = await settingsRepository.getOrgValue<
		Partial<RanobedbOrgConfig>
	>(serverId, "ranobedb");
	const config: RanobedbOrgConfig = value
		? { ...DEFAULT_RANOBEDB_ORG_CONFIG, ...value }
		: { ...DEFAULT_RANOBEDB_ORG_CONFIG };
	ranobedbOrgCache.set(serverId, { value: config, at: now });
	return config;
}

export async function setRanobedbConfig(
	serverId: string,
	patch: Partial<RanobedbOrgConfig>,
): Promise<RanobedbOrgConfig> {
	const merged = { ...(await getRanobedbConfig(serverId)), ...patch };
	await settingsRepository.upsertOrgValue(serverId, "ranobedb", merged);
	ranobedbOrgCache.set(serverId, { value: merged, at: Date.now() });
	return merged;
}

export async function getRanobedbDumpConfig(): Promise<RanobedbDumpConfig> {
	const value =
		await settingsRepository.getValue<Partial<RanobedbDumpConfig>>("ranobedb");
	return value
		? { ...DEFAULT_RANOBEDB_DUMP_CONFIG, ...value }
		: { ...DEFAULT_RANOBEDB_DUMP_CONFIG };
}

export async function setRanobedbDumpConfig(
	patch: Partial<RanobedbDumpConfig>,
): Promise<RanobedbDumpConfig> {
	const merged = { ...(await getRanobedbDumpConfig()), ...patch };
	await settingsRepository.upsert("ranobedb", merged);
	return merged;
}

// ─── Recommendations (per-organization) ─────────────

const RECOMMENDATIONS_KEY = "recommendations";

export type RecommendationsConfig = { enabled: boolean };

const DEFAULT_RECOMMENDATIONS_CONFIG: RecommendationsConfig = { enabled: true };

export async function getRecommendationsConfig(
	serverId: string,
): Promise<RecommendationsConfig> {
	const value = await settingsRepository.getOrgValue<
		Partial<RecommendationsConfig>
	>(serverId, RECOMMENDATIONS_KEY);
	return { ...DEFAULT_RECOMMENDATIONS_CONFIG, ...value };
}

export async function isRecommendationsEnabled(
	serverId: string,
): Promise<boolean> {
	return (await getRecommendationsConfig(serverId)).enabled;
}

export async function setRecommendationsConfig(
	serverId: string,
	patch: Partial<RecommendationsConfig>,
): Promise<RecommendationsConfig> {
	const merged = { ...(await getRecommendationsConfig(serverId)), ...patch };
	await settingsRepository.upsertOrgValue(
		serverId,
		RECOMMENDATIONS_KEY,
		merged,
	);
	// enabling/disabling changes what should be scheduled and computed
	const { enqueueRebuild, registerServerSchedules, unregisterServerSchedules } =
		await import("../../modules/recommendations/recommendation.scheduler");
	if (merged.enabled) {
		await registerServerSchedules(serverId);
		await enqueueRebuild(serverId);
	} else {
		await unregisterServerSchedules(serverId);
	}
	return merged;
}
