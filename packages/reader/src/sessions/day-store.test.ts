import { expect, test } from "bun:test";
import { createDayStore } from "./day-store";

test("day store notifies subscribers only on change and stops after unsubscribe", () => {
	const store = createDayStore();
	let calls = 0;
	const unsubscribe = store.subscribe(() => calls++);
	store.set("2026-09-23");
	store.set("2026-09-23");
	expect(store.get()).toBe("2026-09-23");
	expect(calls).toBe(1);
	unsubscribe();
	store.set(undefined);
	expect(store.get()).toBeUndefined();
	expect(calls).toBe(1);
});
