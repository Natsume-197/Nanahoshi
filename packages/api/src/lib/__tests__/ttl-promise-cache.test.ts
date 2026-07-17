import { describe, expect, test } from "bun:test";
import { TtlPromiseCache } from "../ttl-promise-cache";

describe("TtlPromiseCache", () => {
	test("concurrent gets of the same key share one resolution", async () => {
		const cache = new TtlPromiseCache<string>(1000, 10);
		let calls = 0;
		const resolve = async () => {
			calls += 1;
			return `value-${calls}`;
		};
		const [a, b, c] = await Promise.all([
			cache.get("k", resolve),
			cache.get("k", resolve),
			cache.get("k", resolve),
		]);
		expect(calls).toBe(1);
		expect(a).toBe("value-1");
		expect(b).toBe("value-1");
		expect(c).toBe("value-1");
	});

	test("serves the cached value within the TTL and re-resolves after expiry", async () => {
		let now = 0;
		const cache = new TtlPromiseCache<number>(1000, 10, () => now);
		let calls = 0;
		const resolve = async () => ++calls;

		expect(await cache.get("k", resolve)).toBe(1);
		now = 999;
		expect(await cache.get("k", resolve)).toBe(1);
		now = 1000;
		expect(await cache.get("k", resolve)).toBe(2);
	});

	test("distinct keys resolve independently", async () => {
		const cache = new TtlPromiseCache<string>(1000, 10);
		expect(await cache.get("a", async () => "A")).toBe("A");
		expect(await cache.get("b", async () => "B")).toBe("B");
	});

	test("a failed resolution is evicted immediately", async () => {
		const cache = new TtlPromiseCache<string>(1000, 10);
		let calls = 0;
		const failing = async () => {
			calls += 1;
			throw new Error("boom");
		};
		await expect(cache.get("k", failing)).rejects.toThrow("boom");
		expect(cache.size).toBe(0);
		expect(await cache.get("k", async () => "recovered")).toBe("recovered");
		expect(calls).toBe(1);
	});

	test("evicts expired entries at capacity, clears everything as last resort", async () => {
		let now = 0;
		const cache = new TtlPromiseCache<number>(1000, 2, () => now);
		await cache.get("a", async () => 1);
		await cache.get("b", async () => 2);
		expect(cache.size).toBe(2);

		// both live at capacity → full clear before inserting the new key
		await cache.get("c", async () => 3);
		expect(cache.size).toBe(1);

		// expired entries are pruned instead of clearing live ones
		await cache.get("d", async () => 4);
		now = 1000;
		await cache.get("e", async () => 5);
		expect(cache.size).toBe(1);
	});

	test("clear drops every entry", async () => {
		const cache = new TtlPromiseCache<number>(1000, 10);
		let calls = 0;
		const resolve = async () => ++calls;
		await cache.get("k", resolve);
		cache.clear();
		expect(await cache.get("k", resolve)).toBe(2);
	});
});
