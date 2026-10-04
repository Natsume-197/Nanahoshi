import { afterEach, describe, expect, it } from "bun:test";
import { settingsRepository } from "../../settings/settings.repository";
import { getInstanceName, INSTANCE_SETTINGS_KEY } from "../instance.service";

const original = {
	getValue: settingsRepository.getValue,
	insertIfAbsent: settingsRepository.insertIfAbsent,
};

afterEach(() => {
	Object.assign(settingsRepository, original);
});

describe("getInstanceName", () => {
	it("returns the stored name without writing", async () => {
		let inserts = 0;
		Object.assign(settingsRepository, {
			getValue: async () => ({ name: "Biblioteca de casa" }),
			insertIfAbsent: async () => {
				inserts++;
				return { name: "unused" };
			},
		});
		expect(await getInstanceName()).toBe("Biblioteca de casa");
		expect(inserts).toBe(0);
	});

	it("names an unnamed instance once and keeps that name", async () => {
		const store = new Map<string, unknown>();
		Object.assign(settingsRepository, {
			getValue: async (key: string) => store.get(key),
			insertIfAbsent: async (key: string, value: unknown) => {
				if (!store.has(key)) store.set(key, value);
				return store.get(key);
			},
		});
		const first = await getInstanceName();
		expect(first).toMatch(/^\w+ \w+$/);
		expect(await getInstanceName()).toBe(first);
		expect(store.get(INSTANCE_SETTINGS_KEY)).toEqual({ name: first });
	});

	it("adopts the name a concurrent first read stored", async () => {
		Object.assign(settingsRepository, {
			getValue: async () => undefined,
			insertIfAbsent: async () => ({ name: "Silver Mizar" }),
		});
		expect(await getInstanceName()).toBe("Silver Mizar");
	});
});
