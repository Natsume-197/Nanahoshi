import "@/test-utils/setup-dom";

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ORPCError } from "@orpc/client";

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

let themesGate: Promise<void> | undefined;
let firstSetGate: Promise<{ updatedAt: Date }> | undefined;
const getSetting = mock(async ({ key }: { key: string }) => {
	if (key === "reader-profiles") {
		return { value: remoteProfiles, updatedAt: SERVER_UPDATED_AT };
	}
	if (key === "reader-custom-themes") {
		await themesGate;
		return {
			value: { updatedAt: 42, themes: {} },
			updatedAt: SERVER_UPDATED_AT,
		};
	}
	return null;
});
const setSetting = mock(async () => {
	if (firstSetGate) {
		const gate = firstSetGate;
		firstSetGate = undefined;
		return gate;
	}
	return { updatedAt: SERVER_UPDATED_AT };
});

mock.module("@/utils/orpc", () => ({
	client: {
		userSettings: {
			get: getSetting,
			set: setSetting,
		},
	},
}));

const {
	commitProfilesStore,
	getActiveProfileId,
	loadProfilesStore,
	setProfileSettings,
	syncReaderProfiles,
} = await import("./profiles");
const { clearReaderStorage, prepareReaderStorage, READER_STORAGE_KEYS } =
	await import("./reader-storage");

describe("reader profile account restoration", () => {
	beforeEach(() => {
		window.localStorage.clear();
		themesGate = undefined;
		firstSetGate = undefined;
		getSetting.mockClear();
		setSetting.mockClear();
	});

	test("retries a conflicted push when a newer local edit landed in flight", async () => {
		let rejectFirstSet!: (reason: unknown) => void;
		firstSetGate = new Promise<{ updatedAt: Date }>((_resolve, reject) => {
			rejectFirstSet = reject;
		});
		prepareReaderStorage("conflict-user");
		const seed = loadProfilesStore();
		const activeId = getActiveProfileId(seed);
		const firstEdit = commitProfilesStore(
			setProfileSettings(seed, activeId, {
				...seed.profiles[0].settings,
				fontSize: 20,
			}),
		);

		const syncing = syncReaderProfiles();
		for (
			let attempt = 0;
			attempt < 10 && setSetting.mock.calls.length < 1;
			attempt += 1
		) {
			await Promise.resolve();
		}
		expect(setSetting.mock.calls).toHaveLength(1);

		commitProfilesStore(
			setProfileSettings(firstEdit, activeId, {
				...firstEdit.profiles[0].settings,
				fontSize: 18,
			}),
		);
		rejectFirstSet(new ORPCError("CONFLICT", { status: 409 }));

		await syncing;

		expect(loadProfilesStore().profiles[0]?.settings.fontSize).toBe(18);
		expect(setSetting.mock.calls).toHaveLength(2);
		clearReaderStorage();
	});

	test("preserves edits made while profile synchronization is still finishing", async () => {
		let releaseThemes!: () => void;
		themesGate = new Promise<void>((resolve) => {
			releaseThemes = resolve;
		});
		prepareReaderStorage("late-edit-user");
		loadProfilesStore();

		const syncing = syncReaderProfiles();
		for (
			let attempt = 0;
			attempt < 10 && getSetting.mock.calls.length < 2;
			attempt += 1
		) {
			await Promise.resolve();
		}
		expect(getSetting.mock.calls).toHaveLength(2);

		const adopted = loadProfilesStore();
		const activeId = getActiveProfileId(adopted);
		commitProfilesStore(
			setProfileSettings(adopted, activeId, {
				...adopted.profiles[0].settings,
				fontSize: 18,
			}),
		);

		releaseThemes();
		const result = await syncing;

		expect(result.profiles).toBeNull();
		expect(loadProfilesStore().profiles[0]?.settings.fontSize).toBe(18);
		clearReaderStorage();
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
