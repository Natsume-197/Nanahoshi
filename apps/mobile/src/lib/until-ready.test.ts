import { expect, test } from "bun:test";
import { untilReady } from "./until-ready";

const failing = (times: number) => {
	let calls = 0;
	return {
		call: async () => {
			calls++;
			if (calls <= times) throw new Error("not ready");
			return "shown";
		},
		calls: () => calls,
	};
};

test("a host that isn't ready on the first call still shows the notice", async () => {
	const host = failing(2);
	expect(await untilReady(host.call, { delayMs: 1 })).toBe("shown");
	expect(host.calls()).toBe(3);
});

test("it gives up after its tries", async () => {
	const host = failing(10);
	await expect(untilReady(host.call, { tries: 3, delayMs: 1 })).rejects.toThrow(
		"not ready",
	);
	expect(host.calls()).toBe(3);
});

test("a notice that went away stops the retries", async () => {
	const host = failing(10);
	let gone = false;
	const shown = untilReady(host.call, { delayMs: 5, stopped: () => gone });
	gone = true;
	await expect(shown).rejects.toThrow("not ready");
	expect(host.calls()).toBe(1);
});
