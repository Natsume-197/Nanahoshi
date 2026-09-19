import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for AudiobookRepository series listing/count — the pagination,
 * sort, and browse query backing the audiobook series page.
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

mock.module("@nanahoshi/db", () => ({
	db: { execute: mockExecute },
}));

mock.module("@nanahoshi/env/server", () => ({
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
	coverInfo: { cover: "covers/mt.jpg", color: "#336699" },
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
				coverColor: "#336699",
			},
		]);
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

test("series listing uses semantic parts instead of SQL's title tie-break", async () => {
	const common = {
		filename: "audio.m4b",
		position: 1,
		sequence: "1",
		duration: 100,
		cover: null,
		mainColor: null,
	};
	executeQueue = [
		{
			rows: [
				{
					...common,
					uuid: "second",
					title: "幼女戦記 1 Deus lo vult （後編）",
				},
				{ ...common, uuid: "first", title: "幼女戦記 1 Deus lo vult（前編）" },
			],
		},
	];
	const result = await new AudiobookRepository().listBySeriesUuid(
		"series-uuid",
	);
	expect(result.map((r) => r.uuid)).toEqual(["first", "second"]);
	expect(result[0]?.sequence).toBe("1");
});
