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
		const cooldowns = await gate.scopedCooldowns({
			goodreads: "shared",
			amazon: "shared",
		});
		expect(cooldowns.goodreads).toBeGreaterThan(0);
		expect(cooldowns.goodreads).toBeLessThanOrEqual(1_000);
		expect(cooldowns.amazon).toBeUndefined();
	});

	test("isolates independent quota scopes for the same provider", async () => {
		await gate.trip("googlebooks", 1_000, "org:a");
		expect(
			await gate.cooldownRemainingMs("googlebooks", "org:a"),
		).not.toBeNull();
		expect(await gate.cooldownRemainingMs("googlebooks", "org:b")).toBeNull();
		expect(
			await gate.scopedCooldowns({ googlebooks: "org:a", amazon: "shared" }),
		).toHaveProperty("googlebooks");
	});

	test("an already-open breaker keeps its original deadline", async () => {
		await gate.trip("amazon", 10_000, "org:a");
		await gate.trip("amazon", 60_000, "org:a");

		const remaining = await gate.cooldownRemainingMs("amazon", "org:a");
		expect(remaining).toBeGreaterThan(0);
		expect(remaining).toBeLessThanOrEqual(10_000);
	});

	test("separate gate instances share one exclusive provider lease", async () => {
		const otherProcess = new ProviderGate();
		let active = 0;
		let peak = 0;
		const operation = async () => {
			active++;
			peak = Math.max(peak, active);
			await Bun.sleep(10);
			active--;
		};

		await Promise.all([
			gate.runExclusive("amazon", "domain:co.jp", operation),
			otherProcess.runExclusive("amazon", "domain:co.jp", operation),
		]);

		expect(peak).toBe(1);
	});
});
