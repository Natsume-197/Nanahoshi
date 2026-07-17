import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for ServerStatsRepository.
 *
 * Mocks `@nanahoshi-v2/db` with a thenable select chain; each `db.select()`
 * call consumes the next entry from `selectResults`, matching the fixed order
 * of the queries inside `getStats` (Promise.all preserves call order).
 *
 * Run with:
 *   bun test packages/api/src/routers/server-stats/__tests__/server-stats.repository.test.ts
 */

let selectResults: Array<Array<Record<string, unknown>>> = [];
let selectCallIndex = 0;

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

const mockSelect = mock(() => {
	const result = selectResults[selectCallIndex] ?? [];
	selectCallIndex += 1;
	return createSelectChain(result);
});

mock.module("@nanahoshi-v2/db", () => ({
	db: { select: mockSelect },
}));

const { serverStatsRepository } = await import("../server-stats.repository");

// Query order inside getStats:
// 0 libraryRows, 1 members, 2 authors, 3 series, 4 collections
function setResults({
	libraryRows = [],
	members = [{ count: 0 }],
	authors = [{ count: 0 }],
	series = [{ count: 0 }],
	collections = [{ count: 0 }],
}: Partial<Record<string, Array<Record<string, unknown>>>>) {
	selectResults = [libraryRows, members, authors, series, collections];
}

describe("ServerStatsRepository.getStats", () => {
	beforeEach(() => {
		selectCallIndex = 0;
		mockSelect.mockClear();
	});

	test("maps per-library rows and derives format/storage totals", async () => {
		setResults({
			libraryRows: [
				{
					id: 1,
					name: "Ebooks",
					mediaType: "ebook",
					bookCount: "320",
					storageKb: "6291456",
				},
				{
					id: 2,
					name: "Audio",
					mediaType: "audiobook",
					bookCount: "14",
					storageKb: "4194304",
				},
			],
			members: [{ count: 14 }],
			authors: [{ count: 120 }],
			series: [{ count: 45 }],
			collections: [{ count: 7 }],
		});

		const stats = await serverStatsRepository.getStats("org-1");

		expect(stats.libraries).toEqual([
			{
				id: 1,
				name: "Ebooks",
				mediaType: "ebook",
				bookCount: 320,
				storageKb: 6291456,
			},
			{
				id: 2,
				name: "Audio",
				mediaType: "audiobook",
				bookCount: 14,
				storageKb: 4194304,
			},
		]);
		expect(stats.ebookCount).toBe(320);
		expect(stats.audiobookCount).toBe(14);
		expect(stats.libraryCount).toBe(2);
		expect(stats.memberCount).toBe(14);
		expect(stats.authorCount).toBe(120);
		expect(stats.seriesCount).toBe(45);
		expect(stats.collectionCount).toBe(7);
		expect(stats.storageKb).toBe(6291456 + 4194304);
		expect(mockSelect).toHaveBeenCalledTimes(5);
	});

	test("returns zeros when the server has no content", async () => {
		setResults({});

		const stats = await serverStatsRepository.getStats("org-empty");

		expect(stats).toEqual({
			libraries: [],
			ebookCount: 0,
			audiobookCount: 0,
			libraryCount: 0,
			memberCount: 0,
			authorCount: 0,
			seriesCount: 0,
			collectionCount: 0,
			storageKb: 0,
		});
	});

	test("an empty library appears with zero count and storage", async () => {
		setResults({
			libraryRows: [
				{
					id: 3,
					name: "Nueva",
					mediaType: "ebook",
					bookCount: "0",
					storageKb: "0",
				},
			],
		});

		const stats = await serverStatsRepository.getStats("org-1");

		expect(stats.libraries).toEqual([
			{ id: 3, name: "Nueva", mediaType: "ebook", bookCount: 0, storageKb: 0 },
		]);
		expect(stats.libraryCount).toBe(1);
		expect(stats.ebookCount).toBe(0);
	});

	test("coerces SQL string aggregates to numbers", async () => {
		setResults({
			libraryRows: [
				{
					id: 1,
					name: "L",
					mediaType: "ebook",
					bookCount: "2",
					storageKb: "2048",
				},
			],
		});

		const stats = await serverStatsRepository.getStats("org-1");

		expect(stats.storageKb).toBe(2048);
		expect(stats.libraries[0]?.bookCount).toBe(2);
	});
});
