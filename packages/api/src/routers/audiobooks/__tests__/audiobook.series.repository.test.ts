import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for AudiobookRepository series listing/count — the pagination,
 * sort, and search (PGroonga with ILIKE fallback) backing the audiobook
 * series page.
 *
 * `db.execute` is mocked to return a queued result per call so we can assert
 * how many queries run (e.g. the search fallback) and what they resolve to.
 *
 * Run with:
 *   bun test packages/api/src/routers/audiobooks/__tests__/audiobook.series.repository.test.ts
 */

let executeQueue: Array<{ rows: Array<Record<string, unknown>> }> = [];
const mockExecute = mock(() =>
	Promise.resolve(executeQueue.shift() ?? { rows: [] }),
);

mock.module("@nanahoshi-v2/db", () => ({
	db: { execute: mockExecute },
}));

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

const { AudiobookRepository } = await import("../audiobook.repository");

const seriesRow = {
	id: 1,
	name: "Mushoku Tensei",
	audiobookCount: 3,
	cover: "covers/mt.jpg",
};

describe("AudiobookRepository.listSeriesWithCount", () => {
	let repo: InstanceType<typeof AudiobookRepository>;

	beforeEach(() => {
		repo = new AudiobookRepository();
		executeQueue = [];
		mockExecute.mockClear();
	});

	test("runs a single query and maps rows when there is no search", async () => {
		executeQueue = [{ rows: [seriesRow] }];

		const result = await repo.listSeriesWithCount("org-1", {
			limit: 30,
			offset: 0,
			sort: "name",
		});

		expect(mockExecute).toHaveBeenCalledTimes(1);
		expect(result).toEqual([
			{
				id: 1,
				name: "Mushoku Tensei",
				audiobookCount: 3,
				cover: "covers/mt.jpg",
			},
		]);
	});

	test("a search query that PGroonga matches runs a single query", async () => {
		executeQueue = [{ rows: [seriesRow] }];

		const result = await repo.listSeriesWithCount("org-1", {
			limit: 30,
			offset: 0,
			sort: "name",
			query: "mushoku",
		});

		expect(mockExecute).toHaveBeenCalledTimes(1);
		expect(result).toHaveLength(1);
	});

	test("a search query with no PGroonga hits falls back to ILIKE", async () => {
		// First (PGroonga) returns nothing → second (ILIKE) returns the row.
		executeQueue = [{ rows: [] }, { rows: [seriesRow] }];

		const result = await repo.listSeriesWithCount("org-1", {
			limit: 30,
			offset: 0,
			sort: "name",
			query: "mushok",
		});

		expect(mockExecute).toHaveBeenCalledTimes(2);
		expect(result).toHaveLength(1);
	});

	test("a whitespace-only query does not trigger the search path", async () => {
		executeQueue = [{ rows: [seriesRow] }];

		await repo.listSeriesWithCount("org-1", {
			limit: 30,
			offset: 0,
			sort: "name",
			query: "   ",
		});

		// One plain query, no PGroonga + fallback pair.
		expect(mockExecute).toHaveBeenCalledTimes(1);
	});
});

describe("AudiobookRepository.countSeries", () => {
	let repo: InstanceType<typeof AudiobookRepository>;

	beforeEach(() => {
		repo = new AudiobookRepository();
		executeQueue = [];
		mockExecute.mockClear();
	});

	test("returns the count from the first row", async () => {
		executeQueue = [{ rows: [{ count: 7 }] }];
		expect(await repo.countSeries("org-1")).toBe(7);
	});

	test("returns 0 when there are no rows", async () => {
		executeQueue = [{ rows: [] }];
		expect(await repo.countSeries("org-1")).toBe(0);
	});
});
