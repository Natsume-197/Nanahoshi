import "@/test-utils/setup-dom";

import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.VITE_SERVER_URL = "http://localhost:3000";
process.env.VITE_WEB_URL = "http://localhost:3001";

const SERVER_UPDATED_AT = new Date("2026-08-31T02:00:00.000Z");
const remoteProfiles = {
	updatedAt: 42,
	profiles: [
		{
			id: "account-profile",
			name: "My settings",
			settings: { theme: "Sepia", fontSize: 27 },
		},
	],
};

const getSetting = mock(async ({ key }: { key: string }) => {
	if (key === "reader-profiles") {
		return { value: remoteProfiles, updatedAt: SERVER_UPDATED_AT };
	}
	if (key === "reader-custom-themes") {
		return {
			value: { updatedAt: 42, themes: {} },
			updatedAt: SERVER_UPDATED_AT,
		};
	}
	return null;
});
const setSetting = mock(async () => ({ updatedAt: SERVER_UPDATED_AT }));

mock.module("@/utils/orpc", () => ({
	client: {
		userSettings: {
			get: getSetting,
			set: setSetting,
		},
	},
}));

const { loadProfilesStore, syncReaderProfiles } = await import("./profiles");
const { clearReaderStorage, prepareReaderStorage, READER_STORAGE_KEYS } =
	await import("./reader-storage");

describe("reader profile account restoration", () => {
	beforeEach(() => {
		window.localStorage.clear();
		getSetting.mockClear();
		setSetting.mockClear();
	});

	test("rehydrates the same user's server settings after sign-out", async () => {
		prepareReaderStorage("user-a");
		clearReaderStorage();
		prepareReaderStorage("user-a");

		const emptyLocalSeed = loadProfilesStore();
		expect(emptyLocalSeed.updatedAt).toBe(0);
		expect(emptyLocalSeed.dirty).toBe(true);

		const result = await syncReaderProfiles();

		expect(result.profiles?.profiles[0]).toMatchObject({
			id: "account-profile",
			settings: { theme: "Sepia", fontSize: 27 },
		});
		expect(
			JSON.parse(
				window.localStorage.getItem(READER_STORAGE_KEYS.profiles) ?? "null",
			),
		).toMatchObject({
			updatedAt: 42,
			dirty: false,
			profiles: [{ id: "account-profile" }],
		});
		expect(setSetting).not.toHaveBeenCalled();
	});
});
