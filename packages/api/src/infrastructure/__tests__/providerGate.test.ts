import { beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_PROVIDER_COOLDOWN_MS, ProviderGate } from "../providerGate";

const gate = new ProviderGate();

describe("ProviderGate", () => {
	beforeEach(() => {
		gate.clearAllInMemory();
	});

	test("closed by default, opens on trip, clears on demand", async () => {
		expect(await gate.cooldownRemainingMs("amazon")).toBeNull();

		await gate.trip("amazon");
		const remaining = await gate.cooldownRemainingMs("amazon");
		expect(remaining).toBeGreaterThan(0);
		expect(remaining).toBeLessThanOrEqual(DEFAULT_PROVIDER_COOLDOWN_MS);

		// One provider's breaker never affects another.
		expect(await gate.cooldownRemainingMs("ranobedb")).toBeNull();

		await gate.clear("amazon");
		expect(await gate.cooldownRemainingMs("amazon")).toBeNull();
	});

	test("custom cooldown and bulk view", async () => {
		await gate.trip("goodreads", 1_000);
		const cooldowns = await gate.cooldowns(["goodreads", "amazon"]);
		expect(cooldowns.goodreads).toBeGreaterThan(0);
		expect(cooldowns.goodreads).toBeLessThanOrEqual(1_000);
		expect(cooldowns.amazon).toBeUndefined();
	});
});
