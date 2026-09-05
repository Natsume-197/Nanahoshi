import "@/test-utils/setup-dom";

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ORPCError } from "@orpc/client";

process.env.VITE_SERVER_URL = "http://localhost:3000";
process.env.VITE_WEB_URL = "http://localhost:3001";

Object.assign(globalThis, { CustomEvent: window.CustomEvent });

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

let serverProfiles = structuredClone(remoteProfiles);
let serverUpdatedAt = SERVER_UPDATED_AT;
let themesGate: Promise<void> | undefined;
let firstSetGate: Promise<{ updatedAt: Date }> | undefined;
const getSetting = mock(async ({ key }: { key: string }) => {
	if (key === "reader-profiles") {
		return { value: serverProfiles, updatedAt: serverUpdatedAt };
	}
	if (key === "reader-custom-themes") {
		await themesGate;
		return {
			value: { updatedAt: 42, themes: {} },
			updatedAt: serverUpdatedAt,
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
	return { updatedAt: serverUpdatedAt };
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
	hasPendingReaderProfileConflict,
	resolveReaderProfileConflict,
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
		serverUpdatedAt = SERVER_UPDATED_AT;
		serverProfiles = structuredClone(remoteProfiles);
		themesGate = undefined;
		firstSetGate = undefined;
		getSetting.mockClear();
		setSetting.mockClear();
	});

	for (const choice of ["local", "remote"] as const) {
		test(`holds conflicting settings until the reader chooses ${choice}`, async () => {
			prepareReaderStorage(`choice-${choice}`);
			await syncReaderProfiles();
			const seed = loadProfilesStore();
			commitProfilesStore(
				setProfileSettings(seed, getActiveProfileId(seed), {
					...seed.profiles[0].settings,
					fontSize: 18,
					lineHeight: 2,
				}),
			);
			serverProfiles.profiles[0].settings.fontSize = 30;
			serverProfiles.profiles[0].settings.theme = "Dark";
			serverUpdatedAt = new Date("2026-09-01T02:00:00.000Z");
			setSetting.mockRejectedValueOnce(
				new ORPCError("CONFLICT", { status: 409 }),
			);
			await syncReaderProfiles();
			expect(hasPendingReaderProfileConflict()).toBe(true);
			expect(loadProfilesStore().profiles[0].settings.fontSize).toBe(18);
			await syncReaderProfiles();
			expect(setSetting.mock.calls).toHaveLength(1);
			resolveReaderProfileConflict(choice);
			expect(hasPendingReaderProfileConflict()).toBe(false);
			expect(loadProfilesStore().profiles[0].settings).toMatchObject({
				fontSize: choice === "local" ? 18 : 30,
				lineHeight: 2,
				theme: "Dark",
			});
			await syncReaderProfiles();
			expect(setSetting.mock.calls).toHaveLength(2);
			clearReaderStorage();
		});
	}

	test("does not overwrite the account when a pending legacy edit has no base copy", async () => {
		prepareReaderStorage("unknown-base");
		const seed = loadProfilesStore();
		commitProfilesStore(
			setProfileSettings(seed, getActiveProfileId(seed), {
				...seed.profiles[0].settings,
				fontSize: 18,
			}),
		);
		setSetting.mockRejectedValueOnce(
			new ORPCError("CONFLICT", { status: 409 }),
		);
		await syncReaderProfiles();
		expect(hasPendingReaderProfileConflict()).toBe(true);
		expect(setSetting.mock.calls).toHaveLength(1);
		resolveReaderProfileConflict("remote");
		expect(loadProfilesStore().profiles[0].id).toBe("account-profile");
		clearReaderStorage();
	});

	test("merges another device's theme and profile without undoing the local font size", async () => {
		prepareReaderStorage("merge-user");
		await syncReaderProfiles();
		const seed = loadProfilesStore();
		commitProfilesStore(
			setProfileSettings(seed, getActiveProfileId(seed), {
				...seed.profiles[0].settings,
				fontSize: 18,
			}),
		);
		serverProfiles.profiles[0].settings.theme = "Dark";
		serverProfiles.profiles.push({
			id: "other-device",
			name: "Other",
			settings: { theme: "Sepia", fontSize: 22 },
		});
		serverUpdatedAt = new Date("2026-09-01T02:00:00.000Z");
		setSetting.mockRejectedValueOnce(
			new ORPCError("CONFLICT", { status: 409 }),
		);
		await syncReaderProfiles();
		expect(loadProfilesStore().profiles).toMatchObject([
			{ settings: { fontSize: 18, theme: "Dark" } },
			{ id: "other-device", settings: { fontSize: 22 } },
		]);
		expect(setSetting.mock.calls[1]).toMatchObject([
			{
				value: {
					profiles: [
						{ settings: { fontSize: 18, theme: "Dark" } },
						{ id: "other-device" },
					],
				},
			},
		]);
		clearReaderStorage();
	});

	test("keeps the chosen font size when its save conflicts after editing stops", async () => {
		prepareReaderStorage("stopped-edit-user");
		await syncReaderProfiles();
		const seed = loadProfilesStore();
		commitProfilesStore(
			setProfileSettings(seed, getActiveProfileId(seed), {
				...seed.profiles[0].settings,
				fontSize: 18,
			}),
		);
		setSetting.mockRejectedValueOnce(
			new ORPCError("CONFLICT", { status: 409 }),
		);
		await syncReaderProfiles();
		expect(loadProfilesStore().profiles[0]?.settings.fontSize).toBe(18);
		expect(loadProfilesStore().dirty).toBe(true);
		expect(setSetting.mock.calls).toHaveLength(1);
		await syncReaderProfiles();
		expect(loadProfilesStore().profiles[0]?.settings.fontSize).toBe(18);
		expect(loadProfilesStore().dirty).toBeFalsy();
		clearReaderStorage();
	});

	test("retries the chosen size against an updated server revision", async () => {
		prepareReaderStorage("revision-edit-user");
		await syncReaderProfiles();
		const seed = loadProfilesStore();
		commitProfilesStore(
			setProfileSettings(seed, getActiveProfileId(seed), {
				...seed.profiles[0].settings,
				fontSize: 18,
			}),
		);
		serverUpdatedAt = new Date("2026-09-01T02:00:00.000Z");
		setSetting.mockRejectedValueOnce(
			new ORPCError("CONFLICT", { status: 409 }),
		);
		await syncReaderProfiles();
		expect(loadProfilesStore().profiles[0]?.settings.fontSize).toBe(18);
		expect(loadProfilesStore().dirty).toBeFalsy();
		expect(setSetting.mock.calls).toHaveLength(2);
		expect(setSetting.mock.calls[1]).toMatchObject([
			{
				expectedUpdatedAt: serverUpdatedAt.toISOString(),
				value: { profiles: [{ settings: { fontSize: 18 } }] },
			},
		]);
		clearReaderStorage();
	});

	test("retries a conflicted push when a newer local edit landed in flight", async () => {
		let rejectFirstSet!: (reason: unknown) => void;
		firstSetGate = new Promise<{ updatedAt: Date }>((_resolve, reject) => {
			rejectFirstSet = reject;
		});
		prepareReaderStorage("conflict-user");
		await syncReaderProfiles();
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
