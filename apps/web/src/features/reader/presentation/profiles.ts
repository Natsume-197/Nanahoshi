/**
 * Named reader-settings profiles, synced per user across devices.
 *
 * The localStorage mirror is the source of truth for rendering (the reader
 * must work offline); the server copy is reconciled by whole-blob
 * last-write-wins using the client-stamped `updatedAt` inside the blob.
 * The active-profile pointer is per device and never synced.
 */

import { client } from "@/utils/orpc";
import {
	type CustomReaderThemes,
	loadCustomThemes,
	loadReaderSettings,
	normalizeReaderSettings,
	type ReaderSettings,
	saveCustomThemes,
	saveReaderSettings,
} from "./settings";

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
}

const PROFILES_KEY = "nanahoshi-reader-profiles";
const ACTIVE_PROFILE_KEY = "nanahoshi-reader-active-profile";
const THEMES_META_KEY = "nanahoshi-reader-custom-themes-meta";

function newProfileId(): string {
	return typeof crypto !== "undefined" && crypto.randomUUID
		? crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Legacy migration: wrap the pre-profiles settings blob as "Default".
 * `updatedAt: 0` makes any existing server copy win over this seed. */
function migrateLegacySettings(): ReaderProfilesStore {
	return {
		updatedAt: 0,
		dirty: true,
		profiles: [
			{ id: newProfileId(), name: "Default", settings: loadReaderSettings() },
		],
	};
}

/** Repairs arbitrary (server or stored) data into a valid store. */
export function normalizeProfilesStore(raw: unknown): ReaderProfilesStore {
	if (!raw || typeof raw !== "object") return migrateLegacySettings();
	const stored = raw as Partial<ReaderProfilesStore>;
	if (!Array.isArray(stored.profiles) || stored.profiles.length === 0) {
		return migrateLegacySettings();
	}
	return {
		updatedAt: typeof stored.updatedAt === "number" ? stored.updatedAt : 0,
		...(stored.dirty && { dirty: true }),
		profiles: stored.profiles.map((profile, index) => ({
			id: typeof profile?.id === "string" ? profile.id : newProfileId(),
			name:
				typeof profile?.name === "string" && profile.name
					? profile.name
					: `Profile ${index + 1}`,
			settings: normalizeReaderSettings(profile?.settings),
		})),
	};
}

export function loadProfilesStore(): ReaderProfilesStore {
	if (typeof window === "undefined") return migrateLegacySettings();
	try {
		const raw = window.localStorage.getItem(PROFILES_KEY);
		if (raw) return normalizeProfilesStore(JSON.parse(raw));
	} catch {
		// fall through to migration
	}
	const migrated = migrateLegacySettings();
	saveProfilesStore(migrated);
	return migrated;
}

export function saveProfilesStore(store: ReaderProfilesStore) {
	try {
		window.localStorage.setItem(PROFILES_KEY, JSON.stringify(store));
	} catch {
		// no-op (private mode, quota...)
	}
}

/** Falls back to the first profile when the pointer is missing or orphaned. */
export function getActiveProfileId(store: ReaderProfilesStore): string {
	let pointer: string | null = null;
	try {
		pointer = window.localStorage.getItem(ACTIVE_PROFILE_KEY);
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
		window.localStorage.setItem(ACTIVE_PROFILE_KEY, id);
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
	saveReaderSettings(getProfileSettings(next, getActiveProfileId(next)));
	scheduleProfilesPush();
	return next;
}

function loadThemesMeta(): SyncMeta {
	try {
		const raw = window.localStorage.getItem(THEMES_META_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<SyncMeta>;
			return {
				updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
				...(parsed.dirty && { dirty: true }),
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
		window.localStorage.setItem(THEMES_META_KEY, JSON.stringify(meta));
	} catch {
		// no-op
	}
}

/** Saves custom themes, stamps their sync meta and schedules a push. */
export function commitCustomThemes(themes: CustomReaderThemes) {
	saveCustomThemes(themes);
	saveThemesMeta({ updatedAt: Date.now(), dirty: true });
	scheduleThemesPush();
}

const PUSH_DEBOUNCE_MS = 1000;
let profilesPushTimer: ReturnType<typeof setTimeout> | undefined;
let themesPushTimer: ReturnType<typeof setTimeout> | undefined;

async function pushProfiles() {
	const store = loadProfilesStore();
	try {
		await client.userSettings.set({
			key: "reader-profiles",
			value: { updatedAt: store.updatedAt, profiles: store.profiles },
		});
		const latest = loadProfilesStore();
		// Only clear dirty if nothing changed while the request was in flight.
		if (latest.updatedAt === store.updatedAt && latest.dirty) {
			saveProfilesStore({ ...latest, dirty: false });
		}
	} catch {
		// stays dirty; next sync/commit retries
	}
}

async function pushThemes() {
	const meta = loadThemesMeta();
	try {
		await client.userSettings.set({
			key: "reader-custom-themes",
			value: { updatedAt: meta.updatedAt, themes: loadCustomThemes() },
		});
		const latest = loadThemesMeta();
		if (latest.updatedAt === meta.updatedAt && latest.dirty) {
			saveThemesMeta({ ...latest, dirty: false });
		}
	} catch {
		// stays dirty; next sync/commit retries
	}
}

/** Debounced: quick-settings taps commit rapidly. */
export function scheduleProfilesPush() {
	if (typeof window === "undefined") return;
	clearTimeout(profilesPushTimer);
	profilesPushTimer = setTimeout(() => void pushProfiles(), PUSH_DEBOUNCE_MS);
}

export function scheduleThemesPush() {
	if (typeof window === "undefined") return;
	clearTimeout(themesPushTimer);
	themesPushTimer = setTimeout(() => void pushThemes(), PUSH_DEBOUNCE_MS);
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
		const serverStore = server
			? normalizeProfilesStore(server.value)
			: undefined;

		if (serverStore && serverStore.updatedAt > local.updatedAt) {
			const adopted: ReaderProfilesStore = { ...serverStore, dirty: false };
			saveProfilesStore(adopted);
			saveReaderSettings(
				getProfileSettings(adopted, getActiveProfileId(adopted)),
			);
			result.profiles = adopted;
		} else if (
			!serverStore ||
			local.updatedAt > serverStore.updatedAt ||
			local.dirty
		) {
			if (local.updatedAt === 0) {
				// Fresh legacy migration: stamp it so later devices see a real time.
				saveProfilesStore({ ...local, updatedAt: Date.now() });
			}
			await pushProfiles();
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

		if (serverValue?.themes && serverUpdatedAt > meta.updatedAt) {
			saveCustomThemes(serverValue.themes);
			saveThemesMeta({ updatedAt: serverUpdatedAt, dirty: false });
			result.themes = serverValue.themes;
		} else if (!server || meta.updatedAt > serverUpdatedAt || meta.dirty) {
			if (meta.updatedAt === 0) {
				saveThemesMeta({ ...meta, updatedAt: Date.now() });
			}
			await pushThemes();
		}
	} catch {
		// offline / logged out
	}

	return result;
}
