import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Caching behavior of the server-stats service wrapper.
 *
 * Reuses the thenable select-chain mock from
 * `server-stats.repository.test.ts`: each `db.select()` call resolves one
 * canned row set, and `mockSelect` counts how many underlying batches ran.
 *
 * Run with:
 *   bun test packages/api/src/routers/server-stats/__tests__/server-stats.service.test.ts
 */

function createSelectChain(result: Array<Record<string, unknown>>) {
	const chain = Promise.resolve().then(() => result) as Promise<
		Array<Record<string, unknown>>
	> & {
		from: ReturnType<typeof mock>;
		where: ReturnType<typeof mock>;
		leftJoin: ReturnType<typeof mock>;
		groupBy: ReturnType<typeof mock>;
	};
	chain.from = mock(() => chain);
	chain.where = mock(() => chain);
	chain.leftJoin = mock(() => chain);
	chain.groupBy = mock(() => chain);
	return chain;
}

const LIBRARY_ROWS = [
	{
		id: 1,
		name: "Ebooks",
		mediaType: "ebook",
		bookCount: "320",
		storageKb: "6291456",
	},
];
const COUNT_ROWS = [
	[{ count: 14 }],
	[{ count: 120 }],
	[{ count: 45 }],
	[{ count: 7 }],
];

// getStats issues exactly 5 selects in a fixed order: libraries, members,
// authors, series, collections. Serve the canned rows round-robin so every
// fresh computation resolves identically no matter how many run.
let callIndex = 0;
const mockSelect = mock(() => {
	const batches = [LIBRARY_ROWS, ...COUNT_ROWS];
	const result = batches[callIndex % batches.length] ?? [];
	callIndex += 1;
	return createSelectChain(result);
});

mock.module("@nanahoshi/db", () => ({
	db: { select: mockSelect },
}));

const { clearServerStatsCache, getCachedStats } = await import(
	"../server-stats.service"
);

describe("server-stats service cache", () => {
	beforeEach(() => {
		clearServerStatsCache();
		callIndex = 0;
		mockSelect.mockClear();
	});

	test("repeat calls for one server share a single computation", async () => {
		const first = await getCachedStats("org-1");
		const second = await getCachedStats("org-1");
		expect(second).toEqual(first);
		expect(first.ebookCount).toBe(320);
		// One getStats = 5 selects; the second call must not re-query.
		expect(mockSelect).toHaveBeenCalledTimes(5);
	});

	test("different servers are cached independently", async () => {
		await getCachedStats("org-1");
		await getCachedStats("org-2");
		expect(mockSelect).toHaveBeenCalledTimes(10);
		// Both still cached: no further queries.
		await getCachedStats("org-1");
		await getCachedStats("org-2");
		expect(mockSelect).toHaveBeenCalledTimes(10);
	});

	test("clearing the cache forces a re-query", async () => {
		await getCachedStats("org-1");
		expect(mockSelect).toHaveBeenCalledTimes(5);
		clearServerStatsCache();
		await getCachedStats("org-1");
		expect(mockSelect).toHaveBeenCalledTimes(10);
	});
});
