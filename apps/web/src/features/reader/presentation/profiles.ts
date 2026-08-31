/**
 * Named reader-settings profiles, synced per user across devices.
 *
 * The localStorage mirror is the source of truth for rendering (the reader
 * must work offline); the server copy is reconciled by whole-blob
 * last-write-wins using the client-stamped `updatedAt` inside the blob.
 * The active-profile pointer is per device and never synced.
 */

import { ORPCError } from "@orpc/client";
import { client } from "@/utils/orpc";
import { getReaderStorageOwner, READER_STORAGE_KEYS } from "./reader-storage";
import {
	type CustomReaderThemes,
	loadCustomThemes,
	loadReaderSettings,
	normalizeReaderSettings,
	type ReaderSettings,
	saveCustomThemes,
	saveReaderSettings,
} from "./settings";
import {
	defaultVisualReaderSettings,
	loadVisualReaderSettings,
	type VisualReaderSettings,
} from "./visual-settings";

export interface ReaderProfile {
	id: string;
	name: string;
	settings: ReaderSettings;
}

export interface ReaderProfilesStore {
	updatedAt: number;
	/** Local edits not yet confirmed by the server. */
	dirty?: boolean;
	profiles: ReaderProfile[];
}

interface SyncMeta {
	updatedAt: number;
	dirty?: boolean;
	serverUpdatedAt?: string;
}

export const READER_PROFILES_RECONCILED_EVENT =
	"nanahoshi:reader-profiles-reconciled";

function newProfileId(): string {
	return typeof crypto !== "undefined" && crypto.randomUUID
		? crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Legacy migration: wrap the pre-profiles settings blob as "Default".
 * `updatedAt: 0` makes any existing server copy win over this seed. */
function migrateLegacySettings(): ReaderProfilesStore {
	const settings = loadReaderSettings();
	const visual = loadVisualReaderSettings();
	return {
		updatedAt: 0,
		dirty: true,
		profiles: [
			{
				id: newProfileId(),
				name: "Default",
				settings: {
					...settings,
					visualLayout: visual.layout,
					visualReadingDirection: visual.readingDirection,
					visualProgressStyle: visual.progressStyle,
				},
			},
		],
	};
}

/** Repairs arbitrary (server or stored) data into a valid store. */
export function normalizeProfilesStore(
	raw: unknown,
	legacyVisual: VisualReaderSettings = defaultVisualReaderSettings,
): ReaderProfilesStore {
	if (!raw || typeof raw !== "object") return migrateLegacySettings();
	const stored = raw as Partial<ReaderProfilesStore>;
	if (!Array.isArray(stored.profiles) || stored.profiles.length === 0) {
		return migrateLegacySettings();
	}
	return {
		updatedAt: typeof stored.updatedAt === "number" ? stored.updatedAt : 0,
		...(stored.dirty && { dirty: true }),
		profiles: stored.profiles.map((profile, index) => {
			const rawSettings = profile?.settings as
				| (Partial<ReaderSettings> & Record<string, unknown>)
				| undefined;
			const settings = normalizeReaderSettings(profile?.settings);
			if (rawSettings?.visualLayout === undefined) {
				settings.visualLayout = legacyVisual.layout;
				settings.visualReadingDirection = legacyVisual.readingDirection;
				settings.visualProgressStyle = legacyVisual.progressStyle;
			}
			return {
				id: typeof profile?.id === "string" ? profile.id : newProfileId(),
				name:
					typeof profile?.name === "string" && profile.name
						? profile.name
						: `Profile ${index + 1}`,
				settings,
			};
		}),
	};
}

export function loadProfilesStore(): ReaderProfilesStore {
	if (typeof window === "undefined") return migrateLegacySettings();
	try {
		const raw = window.localStorage.getItem(READER_STORAGE_KEYS.profiles);
		if (raw) {
			const parsed = JSON.parse(raw) as ReaderProfilesStore;
			const needsSettingsMigration = parsed.profiles?.some(
				(profile) =>
					profile?.settings?.visualLayout === undefined ||
					profile?.settings?.horizontalPaddingPct === undefined ||
					profile?.settings?.verticalPaddingPct === undefined,
			);
			const normalized = normalizeProfilesStore(
				parsed,
				loadVisualReaderSettings(),
			);
			if (needsSettingsMigration) {
				const migrated = {
					...normalized,
					updatedAt: Date.now(),
					dirty: true,
				};
				saveProfilesStore(migrated);
				return migrated;
			}
			return normalized;
		}
	} catch {
		// fall through to migration
	}
	const migrated = migrateLegacySettings();
	saveProfilesStore(migrated);
	return migrated;
}

export function saveProfilesStore(store: ReaderProfilesStore) {
	try {
		window.localStorage.setItem(
			READER_STORAGE_KEYS.profiles,
			JSON.stringify(store),
		);
	} catch {
		// no-op (private mode, quota...)
	}
}

/** Falls back to the first profile when the pointer is missing or orphaned. */
export function getActiveProfileId(store: ReaderProfilesStore): string {
	let pointer: string | null = null;
	try {
		pointer = window.localStorage.getItem(READER_STORAGE_KEYS.activeProfile);
	} catch {
		// treat as unset
	}
	if (pointer && store.profiles.some((profile) => profile.id === pointer)) {
		return pointer;
	}
	const fallback = store.profiles[0].id;
	setActiveProfileId(fallback);
	return fallback;
}

export function setActiveProfileId(id: string) {
	try {
		window.localStorage.setItem(READER_STORAGE_KEYS.activeProfile, id);
	} catch {
		// no-op
	}
}

export function getProfileSettings(
	store: ReaderProfilesStore,
	id: string,
): ReaderSettings {
	const profile =
		store.profiles.find((entry) => entry.id === id) ?? store.profiles[0];
	return profile.settings;
}

// ---------- pure transforms (caller commits the result) ----------

export function setProfileSettings(
	store: ReaderProfilesStore,
	id: string,
	settings: ReaderSettings,
): ReaderProfilesStore {
	return {
		...store,
		profiles: store.profiles.map((profile) =>
			profile.id === id ? { ...profile, settings } : profile,
		),
	};
}

/** Repoints every profile before a shared custom-theme key is removed. */
export function replaceProfileThemeReferences(
	store: ReaderProfilesStore,
	fromTheme: string,
	toTheme: string,
): ReaderProfilesStore {
	if (!fromTheme || fromTheme === toTheme) return store;
	return {
		...store,
		profiles: store.profiles.map((profile) =>
			profile.settings.theme === fromTheme
				? {
						...profile,
						settings: { ...profile.settings, theme: toTheme },
					}
				: profile,
		),
	};
}

export function createProfile(
	store: ReaderProfilesStore,
	name: string,
	settings: ReaderSettings,
): { store: ReaderProfilesStore; id: string } {
	const id = newProfileId();
	const profile: ReaderProfile = {
		id,
		name: name.trim() || `Profile ${store.profiles.length + 1}`,
		settings,
	};
	return { store: { ...store, profiles: [...store.profiles, profile] }, id };
}

export function renameProfile(
	store: ReaderProfilesStore,
	id: string,
	name: string,
): ReaderProfilesStore {
	const trimmed = name.trim();
	if (!trimmed) return store;
	return {
		...store,
		profiles: store.profiles.map((profile) =>
			profile.id === id ? { ...profile, name: trimmed } : profile,
		),
	};
}

export function duplicateProfile(
	store: ReaderProfilesStore,
	id: string,
	formatCopyName: (name: string) => string = (name) => `${name} (copy)`,
): { store: ReaderProfilesStore; id: string } {
	const source = store.profiles.find((profile) => profile.id === id);
	if (!source) return { store, id };
	const copyId = newProfileId();
	const index = store.profiles.findIndex((profile) => profile.id === id);
	const profiles = [...store.profiles];
	profiles.splice(index + 1, 0, {
		id: copyId,
		name: formatCopyName(source.name),
		settings: source.settings,
	});
	return { store: { ...store, profiles }, id: copyId };
}

/** The last profile can't be deleted. */
export function deleteProfile(
	store: ReaderProfilesStore,
	id: string,
): ReaderProfilesStore {
	if (store.profiles.length <= 1) return store;
	return {
		...store,
		profiles: store.profiles.filter((profile) => profile.id !== id),
	};
}

// ---------- commit + sync ----------

/**
 * Stamps and saves the store, mirrors the active profile's settings to the
 * legacy key (use-book-loader/download-book read it), and schedules a push.
 */
export function commitProfilesStore(
	store: ReaderProfilesStore,
): ReaderProfilesStore {
	const next: ReaderProfilesStore = {
		...store,
		updatedAt: Date.now(),
		dirty: true,
	};
	saveProfilesStore(next);
	const meta = loadProfilesMeta();
	saveProfilesMeta({ ...meta, updatedAt: next.updatedAt, dirty: true });
	saveReaderSettings(getProfileSettings(next, getActiveProfileId(next)));
	scheduleProfilesPush();
	return next;
}

function loadProfilesMeta(): SyncMeta {
	try {
		const raw = window.localStorage.getItem(READER_STORAGE_KEYS.profilesMeta);
		if (raw) return JSON.parse(raw) as SyncMeta;
	} catch {
		// treat as a legacy store without a known server revision
	}
	return { updatedAt: 0 };
}

function saveProfilesMeta(meta: SyncMeta) {
	try {
		window.localStorage.setItem(
			READER_STORAGE_KEYS.profilesMeta,
			JSON.stringify(meta),
		);
	} catch {
		// no-op
	}
}

function loadThemesMeta(): SyncMeta {
	try {
		const raw = window.localStorage.getItem(READER_STORAGE_KEYS.themesMeta);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<SyncMeta>;
			return {
				updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
				...(parsed.dirty && { dirty: true }),
				...(typeof parsed.serverUpdatedAt === "string" && {
					serverUpdatedAt: parsed.serverUpdatedAt,
				}),
			};
		}
	} catch {
		// treat as unset
	}
	// Pre-existing local themes (created before sync existed) must still land
	// on the server: dirty when any exist.
	return {
		updatedAt: 0,
		dirty: Object.keys(loadCustomThemes()).length > 0,
	};
}

function saveThemesMeta(meta: SyncMeta) {
	try {
		window.localStorage.setItem(
			READER_STORAGE_KEYS.themesMeta,
			JSON.stringify(meta),
		);
	} catch {
		// no-op
	}
}

/** Saves custom themes, stamps their sync meta and schedules a push. */
export function commitCustomThemes(themes: CustomReaderThemes) {
	saveCustomThemes(themes);
	const current = loadThemesMeta();
	saveThemesMeta({
		...current,
		updatedAt: Date.now(),
		dirty: true,
	});
	scheduleThemesPush();
}

const PUSH_DEBOUNCE_MS = 1000;
let profilesPushTimer: ReturnType<typeof setTimeout> | undefined;
let themesPushTimer: ReturnType<typeof setTimeout> | undefined;
let profilesPushInFlight: Promise<boolean> | undefined;
let themesPushInFlight: Promise<boolean> | undefined;

async function pushProfiles(): Promise<boolean> {
	const store = loadProfilesStore();
	const meta = loadProfilesMeta();
	try {
		const result = await client.userSettings.set({
			key: "reader-profiles",
			value: { updatedAt: store.updatedAt, profiles: store.profiles },
			expectedUpdatedAt: meta.serverUpdatedAt ?? null,
		});
		const latest = loadProfilesStore();
		// Only clear dirty if nothing changed while the request was in flight.
		if (latest.updatedAt === store.updatedAt && latest.dirty) {
			saveProfilesStore({ ...latest, dirty: false });
		}
		const latestMeta = loadProfilesMeta();
		saveProfilesMeta({
			...latestMeta,
			...(latestMeta.updatedAt === store.updatedAt && { dirty: false }),
			serverUpdatedAt: new Date(result.updatedAt).toISOString(),
		});
		return true;
	} catch (error) {
		if (!(error instanceof ORPCError) || error.status !== 409) return false;
		// A successful read after a failed CAS means another device won. Adopt its
		// authoritative value; offline failures leave the local store dirty.
		try {
			const server = await client.userSettings.get({ key: "reader-profiles" });
			if (!server) return false;
			const adopted = {
				...normalizeProfilesStore(server.value, loadVisualReaderSettings()),
				dirty: false,
			};
			saveProfilesStore(adopted);
			saveProfilesMeta({
				updatedAt: adopted.updatedAt,
				serverUpdatedAt: new Date(server.updatedAt).toISOString(),
			});
			window.dispatchEvent(
				new CustomEvent(READER_PROFILES_RECONCILED_EVENT, {
					detail: { profiles: adopted },
				}),
			);
			return true;
		} catch {
			// stays dirty; next sync/commit retries
			return false;
		}
	}
}

async function pushThemes(): Promise<boolean> {
	const meta = loadThemesMeta();
	try {
		const result = await client.userSettings.set({
			key: "reader-custom-themes",
			value: { updatedAt: meta.updatedAt, themes: loadCustomThemes() },
			expectedUpdatedAt: meta.serverUpdatedAt ?? null,
		});
		const latest = loadThemesMeta();
		saveThemesMeta({
			...latest,
			...(latest.updatedAt === meta.updatedAt && { dirty: false }),
			serverUpdatedAt: new Date(result.updatedAt).toISOString(),
		});
		return true;
	} catch (error) {
		if (!(error instanceof ORPCError) || error.status !== 409) return false;
		try {
			const server = await client.userSettings.get({
				key: "reader-custom-themes",
			});
			const value = server?.value as
				| { updatedAt?: number; themes?: CustomReaderThemes }
				| undefined;
			if (!server || !value?.themes) return false;
			saveCustomThemes(value.themes);
			saveThemesMeta({
				updatedAt: value.updatedAt ?? 0,
				serverUpdatedAt: new Date(server.updatedAt).toISOString(),
			});
			window.dispatchEvent(
				new CustomEvent(READER_PROFILES_RECONCILED_EVENT, {
					detail: { themes: value.themes },
				}),
			);
			return true;
		} catch {
			// stays dirty; next sync/commit retries
			return false;
		}
	}
}

async function flushProfilesPush(): Promise<void> {
	if (profilesPushInFlight) {
		const completed = await profilesPushInFlight;
		if (completed && loadProfilesStore().dirty) return flushProfilesPush();
		return;
	}
	profilesPushInFlight = pushProfiles();
	let completed = false;
	try {
		completed = await profilesPushInFlight;
	} finally {
		profilesPushInFlight = undefined;
	}
	if (completed && loadProfilesStore().dirty) await flushProfilesPush();
}

async function flushThemesPush(): Promise<void> {
	if (themesPushInFlight) {
		const completed = await themesPushInFlight;
		if (completed && loadThemesMeta().dirty) return flushThemesPush();
		return;
	}
	themesPushInFlight = pushThemes();
	let completed = false;
	try {
		completed = await themesPushInFlight;
	} finally {
		themesPushInFlight = undefined;
	}
	if (completed && loadThemesMeta().dirty) await flushThemesPush();
}

/** Debounced: quick-settings taps commit rapidly. */
export function scheduleProfilesPush() {
	if (typeof window === "undefined") return;
	clearTimeout(profilesPushTimer);
	const owner = getReaderStorageOwner();
	profilesPushTimer = setTimeout(() => {
		if (owner && getReaderStorageOwner() === owner) void flushProfilesPush();
	}, PUSH_DEBOUNCE_MS);
}

export function scheduleThemesPush() {
	if (typeof window === "undefined") return;
	clearTimeout(themesPushTimer);
	const owner = getReaderStorageOwner();
	themesPushTimer = setTimeout(() => {
		if (owner && getReaderStorageOwner() === owner) void flushThemesPush();
	}, PUSH_DEBOUNCE_MS);
}

export interface ReaderProfilesSyncResult {
	/** Set when the server copy was newer and was adopted locally. */
	profiles: ReaderProfilesStore | null;
	/** Set when the server themes were newer and were adopted locally. */
	themes: CustomReaderThemes | null;
}

/**
 * Whole-blob last-write-wins reconciliation with the server. Offline or
 * logged out this is a silent no-op (dirty state persists and is pushed on a
 * later sync). When local is dirty AND the server is newer, the server wins.
 */
export async function syncReaderProfiles(): Promise<ReaderProfilesSyncResult> {
	const result: ReaderProfilesSyncResult = { profiles: null, themes: null };
	if (typeof window === "undefined") return result;

	try {
		const server = await client.userSettings.get({ key: "reader-profiles" });
		const local = loadProfilesStore();
		const meta = loadProfilesMeta();
		const serverStore = server
			? normalizeProfilesStore(server.value, loadVisualReaderSettings())
			: undefined;
		const serverRevision = server
			? new Date(server.updatedAt).toISOString()
			: undefined;

		if (
			serverStore &&
			!local.dirty &&
			meta.serverUpdatedAt !== serverRevision
		) {
			const adopted: ReaderProfilesStore = { ...serverStore, dirty: false };
			saveProfilesStore(adopted);
			saveProfilesMeta({
				updatedAt: adopted.updatedAt,
				serverUpdatedAt: serverRevision,
			});
			saveReaderSettings(
				getProfileSettings(adopted, getActiveProfileId(adopted)),
			);
			result.profiles = adopted;
		} else if (!serverStore || local.dirty) {
			if (serverRevision && !meta.serverUpdatedAt) {
				saveProfilesMeta({ ...meta, serverUpdatedAt: serverRevision });
			}
			if (local.updatedAt === 0) {
				const stamped = { ...local, updatedAt: Date.now(), dirty: true };
				saveProfilesStore(stamped);
				saveProfilesMeta({
					...meta,
					updatedAt: stamped.updatedAt,
					dirty: true,
				});
			}
			await flushProfilesPush();
		} else if (serverRevision && !meta.serverUpdatedAt) {
			saveProfilesMeta({
				updatedAt: local.updatedAt,
				serverUpdatedAt: serverRevision,
			});
		}
	} catch {
		// offline / logged out
	}

	try {
		const server = await client.userSettings.get({
			key: "reader-custom-themes",
		});
		const meta = loadThemesMeta();
		const serverValue = server?.value as
			| { updatedAt?: number; themes?: CustomReaderThemes }
			| null
			| undefined;
		const serverUpdatedAt =
			typeof serverValue?.updatedAt === "number" ? serverValue.updatedAt : 0;
		const serverRevision = server
			? new Date(server.updatedAt).toISOString()
			: undefined;

		if (
			serverValue?.themes &&
			!meta.dirty &&
			meta.serverUpdatedAt !== serverRevision
		) {
			saveCustomThemes(serverValue.themes);
			saveThemesMeta({
				updatedAt: serverUpdatedAt,
				dirty: false,
				serverUpdatedAt: serverRevision,
			});
			result.themes = serverValue.themes;
		} else if (!server || meta.dirty) {
			if (serverRevision && !meta.serverUpdatedAt) {
				saveThemesMeta({ ...meta, serverUpdatedAt: serverRevision });
			}
			if (meta.updatedAt === 0) {
				saveThemesMeta({ ...meta, updatedAt: Date.now() });
			}
			await flushThemesPush();
		} else if (serverRevision && !meta.serverUpdatedAt) {
			saveThemesMeta({ ...meta, serverUpdatedAt: serverRevision });
		}
	} catch {
		// offline / logged out
	}

	return result;
}
