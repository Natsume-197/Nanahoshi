import { beforeEach, describe, expect, mock, test } from "bun:test";

const store = new Map<string, unknown>();

mock.module("../../settings/settings.repository", () => ({
	settingsRepository: {
		getValue: async (key: string) => store.get(key),
		upsert: async (key: string, value: unknown) => {
			// app_settings.value is NOT NULL.
			if (value === null || value === undefined) {
				throw new Error('null value in column "value"');
			}
			store.set(key, value);
		},
	},
}));

const { updateRepository } = await import("../update.repository");

describe("UpdateRepository", () => {
	beforeEach(() => store.clear());

	test("clearing the schedule never writes a null value", async () => {
		await updateRepository.saveSchedule({
			mode: "idle",
			requestedBy: { id: "u1", name: "Admin" },
			requestedAt: "2026-11-24T12:00:00.000Z",
			targetVersion: "v1.5.0",
			sentAt: null,
		});
		expect((await updateRepository.getSchedule())?.mode).toBe("idle");
		await updateRepository.saveSchedule(null);
		expect(await updateRepository.getSchedule()).toBeNull();
	});

	test("reads defaults when nothing is stored", async () => {
		expect(await updateRepository.getPreferences()).toEqual({
			autoDownload: true,
			autoInstall: false,
		});
		expect((await updateRepository.getCheck()).newer).toEqual([]);
		expect(await updateRepository.getInstanceRelease()).toBeNull();
	});
});
