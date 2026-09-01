import { type HonomiyaConfig, HonomiyaConfigSchema } from "./settings.model";
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

// ─── Honomiya (instance-global) ──────────────────────────
// The worker and every organization share one CLI installation and one pool of
// compute credentials. Modal credentials use a separate restricted file store;
// they never enter the general app_settings JSON table.

const HONOMIYA_KEY = "honomiya";

export const DEFAULT_HONOMIYA_CONFIG: HonomiyaConfig = {
	enabled: true,
	cliPath: null,
	provider: "modal",
	quality: "accurate",
	parallelChunks: 2,
	retries: 2,
	workerConcurrency: 1,
};

export async function getHonomiyaConfig(): Promise<HonomiyaConfig> {
	const value =
		await settingsRepository.getValue<Partial<HonomiyaConfig>>(HONOMIYA_KEY);
	const parsed = HonomiyaConfigSchema.safeParse({
		...DEFAULT_HONOMIYA_CONFIG,
		...value,
	});
	return parsed.success ? parsed.data : { ...DEFAULT_HONOMIYA_CONFIG };
}

export async function setHonomiyaConfig(
	patch: Partial<HonomiyaConfig>,
): Promise<HonomiyaConfig> {
	const merged = HonomiyaConfigSchema.parse({
		...(await getHonomiyaConfig()),
		...patch,
	});
	await settingsRepository.upsert(HONOMIYA_KEY, merged);
	return merged;
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

// ─── HTTP metadata providers (per-organization) ──────────
// Same shape as the RanobeDB org config: cached getter (read per book during
// enrichment) + cache-refreshing setter. API keys/tokens are tenant-scoped
// credentials, like the Amazon cookie.

function createOrgProviderConfig<T extends { enabled: boolean }>(
	key: string,
	defaults: T,
) {
	const cache = new Map<string, { value: T; at: number }>();
	const TTL_MS = 60_000;

	return {
		async get(serverId: string): Promise<T> {
			const now = Date.now();
			const cached = cache.get(serverId);
			if (cached && now - cached.at < TTL_MS) return cached.value;

			const value = await settingsRepository.getOrgValue<Partial<T>>(
				serverId,
				key,
			);
			const config: T = value ? { ...defaults, ...value } : { ...defaults };
			cache.set(serverId, { value: config, at: now });
			return config;
		},
		async set(serverId: string, patch: Partial<T>): Promise<T> {
			const merged = { ...(await this.get(serverId)), ...patch };
			await settingsRepository.upsertOrgValue(serverId, key, merged);
			cache.set(serverId, { value: merged, at: Date.now() });
			return merged;
		},
	};
}

export type GoogleBooksConfig = {
	enabled: boolean;
	apiKey?: string;
	langRestrict?: string;
};

export type OpenLibraryConfig = { enabled: boolean };

export type GoodreadsConfig = { enabled: boolean };

export type ComicvineConfig = { enabled: boolean; apiKey?: string };

export type HardcoverConfig = { enabled: boolean; apiToken?: string };

const googleBooksStore = createOrgProviderConfig<GoogleBooksConfig>(
	"googlebooks",
	{ enabled: true },
);
const openLibraryStore = createOrgProviderConfig<OpenLibraryConfig>(
	"openlibrary",
	{ enabled: true },
);
const goodreadsStore = createOrgProviderConfig<GoodreadsConfig>("goodreads", {
	enabled: true,
});
const comicvineStore = createOrgProviderConfig<ComicvineConfig>("comicvine", {
	enabled: true,
});
const hardcoverStore = createOrgProviderConfig<HardcoverConfig>("hardcover", {
	enabled: true,
});

export const getGoogleBooksConfig = (serverId: string) =>
	googleBooksStore.get(serverId);
export const setGoogleBooksConfig = (
	serverId: string,
	patch: Partial<GoogleBooksConfig>,
) => googleBooksStore.set(serverId, patch);

export const getOpenLibraryConfig = (serverId: string) =>
	openLibraryStore.get(serverId);
export const setOpenLibraryConfig = (
	serverId: string,
	patch: Partial<OpenLibraryConfig>,
) => openLibraryStore.set(serverId, patch);

export const getGoodreadsConfig = (serverId: string) =>
	goodreadsStore.get(serverId);
export const setGoodreadsConfig = (
	serverId: string,
	patch: Partial<GoodreadsConfig>,
) => goodreadsStore.set(serverId, patch);

export const getComicvineConfig = (serverId: string) =>
	comicvineStore.get(serverId);
export const setComicvineConfig = (
	serverId: string,
	patch: Partial<ComicvineConfig>,
) => comicvineStore.set(serverId, patch);

export const getHardcoverConfig = (serverId: string) =>
	hardcoverStore.get(serverId);
export const setHardcoverConfig = (
	serverId: string,
	patch: Partial<HardcoverConfig>,
) => hardcoverStore.set(serverId, patch);

// ─── Recommendations (per-organization) ─────────────

const RECOMMENDATIONS_KEY = "recommendations";

export type RecommendationsConfig = {
	/** Whether any recommendation feature needs the shared similarity model. */
	enabled: boolean;
	personalizedEnabled: boolean;
	similarEnabled: boolean;
};

const DEFAULT_RECOMMENDATIONS_CONFIG: RecommendationsConfig = {
	enabled: true,
	personalizedEnabled: true,
	similarEnabled: true,
};

export async function getRecommendationsConfig(
	serverId: string,
): Promise<RecommendationsConfig> {
	const value = await settingsRepository.getOrgValue<
		Partial<RecommendationsConfig>
	>(serverId, RECOMMENDATIONS_KEY);
	// Before the features were split, `enabled` controlled both. Treat it as the
	// fallback so existing organizations keep exactly the behavior they chose.
	const legacyEnabled =
		value?.enabled ?? DEFAULT_RECOMMENDATIONS_CONFIG.enabled;
	const personalizedEnabled = value?.personalizedEnabled ?? legacyEnabled;
	const similarEnabled = value?.similarEnabled ?? legacyEnabled;
	return {
		enabled: personalizedEnabled || similarEnabled,
		personalizedEnabled,
		similarEnabled,
	};
}

export async function isRecommendationsEnabled(
	serverId: string,
): Promise<boolean> {
	return (await getRecommendationsConfig(serverId)).enabled;
}

export async function isPersonalizedRecommendationsEnabled(
	serverId: string,
): Promise<boolean> {
	return (await getRecommendationsConfig(serverId)).personalizedEnabled;
}

export async function isSimilarRecommendationsEnabled(
	serverId: string,
): Promise<boolean> {
	return (await getRecommendationsConfig(serverId)).similarEnabled;
}

export async function setRecommendationsConfig(
	serverId: string,
	patch: Partial<RecommendationsConfig>,
): Promise<RecommendationsConfig> {
	const current = await getRecommendationsConfig(serverId);
	const personalizedEnabled =
		patch.personalizedEnabled ?? current.personalizedEnabled;
	const similarEnabled = patch.similarEnabled ?? current.similarEnabled;
	const merged: RecommendationsConfig = {
		enabled: personalizedEnabled || similarEnabled,
		personalizedEnabled,
		similarEnabled,
	};
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

// ─── Book link previews (per-organization) ────────────────

const BOOK_LINK_PREVIEW_KEY = "book-link-preview";

export type BookLinkPreviewConfig = {
	enabled: boolean;
};

const DEFAULT_BOOK_LINK_PREVIEW_CONFIG: BookLinkPreviewConfig = {
	// Catalog metadata stays private until a server administrator explicitly
	// opts in. The preview never grants access to the book or its files.
	enabled: false,
};

export async function getBookLinkPreviewConfig(
	serverId: string,
): Promise<BookLinkPreviewConfig> {
	const value = await settingsRepository.getOrgValue<
		Partial<BookLinkPreviewConfig>
	>(serverId, BOOK_LINK_PREVIEW_KEY);
	return value
		? { ...DEFAULT_BOOK_LINK_PREVIEW_CONFIG, ...value }
		: { ...DEFAULT_BOOK_LINK_PREVIEW_CONFIG };
}

export async function setBookLinkPreviewConfig(
	serverId: string,
	patch: Partial<BookLinkPreviewConfig>,
): Promise<BookLinkPreviewConfig> {
	const merged = { ...(await getBookLinkPreviewConfig(serverId)), ...patch };
	await settingsRepository.upsertOrgValue(
		serverId,
		BOOK_LINK_PREVIEW_KEY,
		merged,
	);
	return merged;
}
