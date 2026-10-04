import { describe, expect, mock, test } from "bun:test";
import { createPersistedFlag } from "./persisted-flag";

function memoryStorage(initial: boolean) {
	const writes: boolean[] = [];
	return {
		writes,
		storage: {
			read: () => initial,
			write: async (on: boolean) => {
				writes.push(on);
			},
		},
	};
}

describe("createPersistedFlag", () => {
	test("starts from what was stored", () => {
		expect(createPersistedFlag(memoryStorage(true).storage).isOn()).toBe(true);
	});

	test("persists a change and tells listeners", async () => {
		const { storage, writes } = memoryStorage(false);
		const offline = createPersistedFlag(storage);
		const listener = mock();
		offline.subscribe(listener);
		await offline.set(true);
		expect(offline.isOn()).toBe(true);
		expect(listener).toHaveBeenCalledTimes(1);
		expect(writes).toEqual([true]);
	});

	test("setting the same value is a no-op", async () => {
		const { storage, writes } = memoryStorage(false);
		const offline = createPersistedFlag(storage);
		const listener = mock();
		offline.subscribe(listener);
		await offline.set(false);
		expect(listener).not.toHaveBeenCalled();
		expect(writes).toEqual([]);
	});
});
