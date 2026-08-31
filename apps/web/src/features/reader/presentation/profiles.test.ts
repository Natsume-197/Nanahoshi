import { describe, expect, test } from "bun:test";
import type { ReaderProfilesStore } from "./profiles";

process.env.VITE_SERVER_URL = "http://localhost:3000";
process.env.VITE_WEB_URL = "http://localhost:3001";

const {
	duplicateProfile,
	normalizeProfilesStore,
	replaceProfileThemeReferences,
	shouldAdoptServerProfiles,
} = await import("./profiles");
const { defaultReaderSettings } = await import("./settings");

describe("reader profile transforms", () => {
	test("uses the localized copy name and inserts the duplicate after its source", () => {
		const store: ReaderProfilesStore = {
			updatedAt: 0,
			profiles: [
				{ id: "day", name: "Día", settings: defaultReaderSettings },
				{ id: "night", name: "Noche", settings: defaultReaderSettings },
			],
		};

		const duplicate = duplicateProfile(
			store,
			"day",
			(name) => `Copia de ${name}`,
		);

		expect(duplicate.id).not.toBe("day");
		expect(
			duplicate.store.profiles.map(({ id, name }) => ({ id, name })),
		).toEqual([
			{ id: "day", name: "Día" },
			{ id: duplicate.id, name: "Copia de Día" },
			{ id: "night", name: "Noche" },
		]);
	});

	test("repoints every profile when a shared custom theme is renamed", () => {
		const themed = { ...defaultReaderSettings, theme: "Evening" };
		const store: ReaderProfilesStore = {
			updatedAt: 0,
			profiles: [
				{ id: "one", name: "One", settings: themed },
				{ id: "two", name: "Two", settings: themed },
				{ id: "three", name: "Three", settings: defaultReaderSettings },
			],
		};

		const next = replaceProfileThemeReferences(store, "Evening", "Night");
		expect(next.profiles.map(({ settings }) => settings.theme)).toEqual([
			"Night",
			"Night",
			defaultReaderSettings.theme,
		]);
	});

	test("migrates the legacy global visual settings into every profile", () => {
		const {
			visualLayout: _visualLayout,
			visualReadingDirection: _visualReadingDirection,
			visualProgressStyle: _visualProgressStyle,
			...legacySettings
		} = defaultReaderSettings;
		const store = normalizeProfilesStore(
			{
				updatedAt: 1,
				profiles: [
					{ id: "one", name: "One", settings: legacySettings },
					{ id: "two", name: "Two", settings: legacySettings },
				],
			},
			{
				layout: "vertical-strip",
				readingDirection: "rtl",
				progressStyle: "bar",
			},
		);

		for (const profile of store.profiles) {
			expect(profile.settings.visualLayout).toBe("vertical-strip");
			expect(profile.settings.visualReadingDirection).toBe("rtl");
			expect(profile.settings.visualProgressStyle).toBe("bar");
		}
	});

	test("restores the account copy after sign-out instead of uploading defaults", () => {
		const localSeed: ReaderProfilesStore = {
			updatedAt: 0,
			dirty: true,
			profiles: [
				{
					id: "local-default",
					name: "Default",
					settings: defaultReaderSettings,
				},
			],
		};

		expect(
			shouldAdoptServerProfiles(
				localSeed,
				undefined,
				"2026-08-31T02:00:00.000Z",
			),
		).toBe(true);
	});
});
