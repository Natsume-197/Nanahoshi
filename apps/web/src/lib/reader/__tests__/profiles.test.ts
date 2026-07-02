import "@/test-utils/setup-dom";
import { beforeEach, describe, expect, it, mock } from "bun:test";

// Control the orpc client without loading the real one (whose env validation
// needs VITE_SERVER_URL). Mock BEFORE importing the module.
type ServerBlob = { value: unknown; updatedAt: Date } | null;
let serverBlobs: Record<string, ServerBlob> = {};
let setShouldFail = false;

const userSettingsGet = mock(async ({ key }: { key: string }) => {
	return serverBlobs[key] ?? null;
});
const userSettingsSet = mock(
	async ({ key, value }: { key: string; value: unknown }) => {
		if (setShouldFail) throw new Error("network");
		serverBlobs[key] = { value, updatedAt: new Date() };
	},
);

mock.module("@/utils/orpc", () => ({
	client: { userSettings: { get: userSettingsGet, set: userSettingsSet } },
}));

const {
	loadProfilesStore,
	saveProfilesStore,
	normalizeProfilesStore,
	getActiveProfileId,
	setActiveProfileId,
	setProfileSettings,
	createProfile,
	renameProfile,
	duplicateProfile,
	deleteProfile,
	commitProfilesStore,
	syncReaderProfiles,
} = await import("../profiles");
const { defaultReaderSettings } = await import("../settings");

const PROFILES_KEY = "nanahoshi-reader-profiles";
const ACTIVE_KEY = "nanahoshi-reader-active-profile";
const LEGACY_KEY = "nanahoshi-reader-settings";

const readStored = () =>
	JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "null");

beforeEach(() => {
	localStorage.clear();
	serverBlobs = {};
	setShouldFail = false;
	userSettingsGet.mockClear();
	userSettingsSet.mockClear();
});

describe("legacy migration", () => {
	it("wraps existing settings as a dirty Default profile with updatedAt 0", () => {
		localStorage.setItem(
			LEGACY_KEY,
			JSON.stringify({ ...defaultReaderSettings, fontSize: 42 }),
		);
		const store = loadProfilesStore();
		expect(store.updatedAt).toBe(0);
		expect(store.dirty).toBe(true);
		expect(store.profiles).toHaveLength(1);
		expect(store.profiles[0].name).toBe("Default");
		expect(store.profiles[0].settings.fontSize).toBe(42);
		// persisted so the migration only happens once
		expect(readStored().profiles).toHaveLength(1);
	});

	it("falls back to defaults when no legacy settings exist", () => {
		const store = loadProfilesStore();
		expect(store.profiles[0].settings).toEqual(defaultReaderSettings);
	});
});

describe("normalizeProfilesStore", () => {
	it("repairs missing ids/names and normalizes each profile's settings", () => {
		const store = normalizeProfilesStore({
			updatedAt: 5,
			profiles: [{ settings: { fontSize: 30, bogusKey: true } }],
		});
		expect(store.updatedAt).toBe(5);
		expect(store.profiles[0].id).toBeTruthy();
		expect(store.profiles[0].name).toBe("Profile 1");
		expect(store.profiles[0].settings.fontSize).toBe(30);
		expect("bogusKey" in store.profiles[0].settings).toBe(false);
	});

	it("treats an empty/invalid blob as a legacy migration", () => {
		const store = normalizeProfilesStore({ updatedAt: 9, profiles: [] });
		expect(store.profiles).toHaveLength(1);
		expect(store.updatedAt).toBe(0);
	});
});

describe("profile transforms", () => {
	it("rename keeps the id and ignores empty names", () => {
		const base = loadProfilesStore();
		const id = base.profiles[0].id;
		expect(renameProfile(base, id, "  ")).toBe(base);
		const renamed = renameProfile(base, id, " Mobile ");
		expect(renamed.profiles[0].id).toBe(id);
		expect(renamed.profiles[0].name).toBe("Mobile");
	});

	it("duplicate copies settings under a new id, inserted after the source", () => {
		const base = loadProfilesStore();
		const sourceId = base.profiles[0].id;
		const { store, id } = duplicateProfile(base, sourceId);
		expect(id).not.toBe(sourceId);
		expect(store.profiles).toHaveLength(2);
		expect(store.profiles[1].id).toBe(id);
		expect(store.profiles[1].name).toBe("Default (copy)");
		expect(store.profiles[1].settings).toEqual(base.profiles[0].settings);
	});

	it("create trims the name and defaults it when empty", () => {
		const base = loadProfilesStore();
		const created = createProfile(base, "  ", defaultReaderSettings);
		expect(created.store.profiles[1].name).toBe("Profile 2");
	});

	it("delete removes a profile but never the last one", () => {
		const base = loadProfilesStore();
		expect(deleteProfile(base, base.profiles[0].id)).toBe(base);
		const { store, id } = duplicateProfile(base, base.profiles[0].id);
		const after = deleteProfile(store, id);
		expect(after.profiles).toHaveLength(1);
	});
});

describe("active profile pointer", () => {
	it("falls back to the first profile when missing or orphaned and persists it", () => {
		const base = loadProfilesStore();
		localStorage.setItem(ACTIVE_KEY, "orphaned-id");
		expect(getActiveProfileId(base)).toBe(base.profiles[0].id);
		expect(localStorage.getItem(ACTIVE_KEY)).toBe(base.profiles[0].id);
	});

	it("resolves a valid pointer", () => {
		const { store, id } = duplicateProfile(
			loadProfilesStore(), // second one
			loadProfilesStore().profiles[0].id,
		);
		saveProfilesStore(store);
		setActiveProfileId(id);
		expect(getActiveProfileId(store)).toBe(id);
	});
});

describe("commitProfilesStore", () => {
	it("stamps updatedAt/dirty and mirrors the active settings to the legacy key", () => {
		const base = loadProfilesStore();
		const id = getActiveProfileId(base);
		const next = setProfileSettings(base, id, {
			...defaultReaderSettings,
			fontSize: 99,
		});
		const committed = commitProfilesStore(next);
		expect(committed.updatedAt).toBeGreaterThan(0);
		expect(committed.dirty).toBe(true);
		expect(readStored().updatedAt).toBe(committed.updatedAt);
		const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "{}");
		expect(legacy.fontSize).toBe(99);
	});
});

describe("syncReaderProfiles", () => {
	it("pushes the local store when the server has none, stamping fresh time", async () => {
		loadProfilesStore(); // seeds updatedAt 0, dirty
		const result = await syncReaderProfiles();
		expect(result.profiles).toBeNull();
		const pushed = userSettingsSet.mock.calls.find(
			([input]) => input.key === "reader-profiles",
		);
		expect(pushed).toBeDefined();
		const stored = readStored();
		expect(stored.updatedAt).toBeGreaterThan(0);
		expect(stored.dirty).toBe(false);
	});

	it("adopts a newer server copy and mirrors the active profile locally", async () => {
		const local = commitProfilesStore(loadProfilesStore());
		serverBlobs["reader-profiles"] = {
			value: {
				updatedAt: local.updatedAt + 1000,
				profiles: [
					{
						id: "srv-1",
						name: "Mobile",
						settings: { ...defaultReaderSettings, fontSize: 18 },
					},
				],
			},
			updatedAt: new Date(),
		};
		const result = await syncReaderProfiles();
		expect(result.profiles?.profiles[0].name).toBe("Mobile");
		expect(readStored().profiles[0].id).toBe("srv-1");
		expect(readStored().dirty).toBe(false);
		const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "{}");
		expect(legacy.fontSize).toBe(18);
	});

	it("pushes when local is newer than the server copy", async () => {
		const local = commitProfilesStore(loadProfilesStore());
		serverBlobs["reader-profiles"] = {
			value: { updatedAt: local.updatedAt - 1000, profiles: local.profiles },
			updatedAt: new Date(),
		};
		const result = await syncReaderProfiles();
		expect(result.profiles).toBeNull();
		expect(
			userSettingsSet.mock.calls.some(
				([input]) => input.key === "reader-profiles",
			),
		).toBe(true);
	});

	it("keeps dirty when the push fails, so a later sync retries", async () => {
		loadProfilesStore();
		setShouldFail = true;
		await syncReaderProfiles();
		expect(readStored().dirty).toBe(true);
	});

	it("is a silent no-op when the server is unreachable", async () => {
		loadProfilesStore();
		userSettingsGet.mockImplementationOnce(async () => {
			throw new Error("offline");
		});
		const result = await syncReaderProfiles();
		expect(result.profiles).toBeNull();
	});

	it("adopts newer server custom themes", async () => {
		serverBlobs["reader-custom-themes"] = {
			value: {
				updatedAt: Date.now() + 1000,
				themes: {
					Night: {
						fontColor: "#fff",
						backgroundColor: "#000",
						selectionFontColor: "#000",
						selectionBackgroundColor: "#fff",
						hintFuriganaShadowColor: "#000",
						hintFuriganaFontColor: "#fff",
						tooltipTextFontColor: "#fff",
					},
				},
			},
			updatedAt: new Date(),
		};
		const result = await syncReaderProfiles();
		expect(result.themes?.Night.backgroundColor).toBe("#000");
		const stored = JSON.parse(
			localStorage.getItem("nanahoshi-reader-custom-themes") ?? "{}",
		);
		expect(stored.Night).toBeDefined();
	});
});
