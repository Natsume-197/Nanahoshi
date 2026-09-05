import { describe, expect, test } from "bun:test";
import type { ReaderProfilesStore } from "./profiles";

process.env.VITE_SERVER_URL = "http://localhost:3000";
process.env.VITE_WEB_URL = "http://localhost:3001";

const {
	duplicateProfile,
	mergeReaderProfiles,
	hasReaderProfileConflict,
	normalizeProfilesStore,
	replaceProfileThemeReferences,
	shouldAdoptServerProfiles,
} = await import("./profiles");
const { defaultReaderSettings } = await import("./settings");

describe("reader profile transforms", () => {
	test("requires a choice for conflicting renames, edit/delete and missing history", () => {
		const a = { id: "a", name: "Day", settings: defaultReaderSettings };
		const b = { ...a, id: "b" };
		expect(
			hasReaderProfileConflict(
				[a, b],
				[{ ...a, name: "Local" }, b],
				[{ ...a, name: "Remote" }, b],
			),
		).toBe(true);
		expect(
			hasReaderProfileConflict([a, b], [b], [{ ...a, name: "Remote" }, b]),
		).toBe(true);
		expect(hasReaderProfileConflict(undefined, [a], [a, b])).toBe(true);
		expect(hasReaderProfileConflict([a, b], [a], [a, b])).toBe(false);
	});

	test("merges field edits, renames, additions and deletions without restoring untouched deleted profiles", () => {
		const a = { id: "a", name: "Day", settings: { ...defaultReaderSettings } };
		const b = { ...a, id: "b" };
		const c = { ...a, id: "c" };
		const remoteA = {
			...a,
			name: "Renamed",
			settings: { ...a.settings, fontSize: 30, lineHeight: 2 },
		};
		const localA = { ...a, settings: { ...a.settings, fontSize: 18 } };
		expect(mergeReaderProfiles([a, b], [localA], [remoteA, b, c])).toEqual([
			{ ...remoteA, settings: { ...remoteA.settings, fontSize: 18 } },
			c,
		]);
		expect(mergeReaderProfiles([a, b], [a, b], [b])).toEqual([b]);
		expect(mergeReaderProfiles([a, b], [localA, b], [b])).toEqual([localA, b]);
		expect(mergeReaderProfiles([a, b], [a], [b])).toEqual([a]);
	});

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
