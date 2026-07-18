import { describe, expect, test } from "bun:test";
import { type ImpressionRedis, ImpressionStore } from "../impression.store";

const HOUR = 3_600_000;

function fakeRedis(initial: Record<string, string> = {}) {
	const hashes = new Map<string, Record<string, string>>();
	const expires: [string, number][] = [];
	let failing = false;
	const client: ImpressionRedis = {
		async hgetall(key) {
			if (failing) throw new Error("redis down");
			return { ...(hashes.get(key) ?? initial) };
		},
		async hset(key, fields) {
			if (failing) throw new Error("redis down");
			hashes.set(key, { ...(hashes.get(key) ?? {}), ...fields });
		},
		async expire(key, seconds) {
			if (failing) throw new Error("redis down");
			expires.push([key, seconds]);
		},
	};
	return {
		client,
		hashes,
		expires,
		fail() {
			failing = true;
		},
	};
}

describe("ImpressionStore", () => {
	test("load parses count:lastMs fields and skips malformed ones", async () => {
		const fake = fakeRedis({
			"book:1": "3:1000",
			"series:2": "1:2000",
			broken: "nonsense",
		});
		const store = new ImpressionStore(fake.client);
		const map = await store.load("org", "u1");
		expect(map.get("book:1")).toEqual({ count: 3, lastMs: 1000 });
		expect(map.get("series:2")).toEqual({ count: 1, lastMs: 2000 });
		expect(map.has("broken")).toBe(false);
	});

	test("record increments unseen works and sets a TTL", async () => {
		const fake = fakeRedis();
		const store = new ImpressionStore(fake.client);
		await store.record("org", "u1", ["book:1", "book:2"], new Map(), 5000);
		const hash = fake.hashes.get("recs:imp:org:u1");
		expect(hash).toEqual({ "book:1": "1:5000", "book:2": "1:5000" });
		expect(fake.expires.length).toBe(1);
	});

	test("impressions inside the session window are not double-counted", async () => {
		const fake = fakeRedis();
		const store = new ImpressionStore(fake.client);
		const now = 100 * HOUR;
		const existing = new Map([
			// 1h ago: same session, skip
			["book:1", { count: 2, lastMs: now - HOUR }],
			// 7h ago: new session, count
			["book:2", { count: 2, lastMs: now - 7 * HOUR }],
		]);
		await store.record("org", "u1", ["book:1", "book:2"], existing, now);
		const hash = fake.hashes.get("recs:imp:org:u1");
		expect(hash).toEqual({ "book:2": `3:${now}` });
	});

	test("nothing to write → no Redis calls at all", async () => {
		const fake = fakeRedis();
		const store = new ImpressionStore(fake.client);
		const existing = new Map([["book:1", { count: 1, lastMs: 1000 }]]);
		await store.record("org", "u1", ["book:1"], existing, 1000 + HOUR);
		expect(fake.hashes.size).toBe(0);
		expect(fake.expires.length).toBe(0);
	});

	test("redis failures degrade silently: empty load, swallowed record", async () => {
		const fake = fakeRedis();
		fake.fail();
		const store = new ImpressionStore(fake.client);
		expect((await store.load("org", "u1")).size).toBe(0);
		await store.record("org", "u1", ["book:1"], new Map(), 1);
	});
});
