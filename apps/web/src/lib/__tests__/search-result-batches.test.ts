import { describe, expect, test } from "bun:test";
import type { TopResultPools } from "@nanahoshi-v2/api/routers/search/search.ranking";
import {
	mergeStableSearchResults,
	rankSearchResultBatches,
	searchResultKey,
} from "../search-result-batches";

const emptyBatch = (): TopResultPools => ({
	books: [],
	audiobooks: [],
	series: [],
	authors: [],
	collections: [],
	users: [],
});

describe("rankSearchResultBatches", () => {
	test("keeps an already rendered batch stable when a stronger later result arrives", () => {
		const firstBatch = emptyBatch();
		firstBatch.books.push({
			uuid: "book-1",
			title: "Alpha",
			filename: "alpha.epub",
		});
		firstBatch.audiobooks.push({
			uuid: "audio-1",
			title: "Alpha",
			filename: "alpha.m4b",
		});

		const laterBatch = emptyBatch();
		laterBatch.series.push({
			uuid: "series-1",
			name: "Alpha",
			cover: null,
			bookCount: 10,
		});

		const before = rankSearchResultBatches([firstBatch], "alpha");
		const after = rankSearchResultBatches([firstBatch, laterBatch], "alpha");

		expect(after.slice(0, before.length).map(searchResultKey)).toEqual(
			before.map(searchResultKey),
		);
		expect(after.at(-1)?.type).toBe("series");
	});

	test("preserves committed rows when a cumulative ranking changes", () => {
		const firstBatch = emptyBatch();
		firstBatch.books.push({
			uuid: "book-1",
			title: "Alpha",
			filename: "alpha.epub",
		});
		const laterBatch = emptyBatch();
		laterBatch.series.push({
			uuid: "series-1",
			name: "Alpha",
			cover: null,
			bookCount: 10,
		});

		const committed = rankSearchResultBatches([firstBatch], "alpha");
		const cumulativelyRanked = [
			...rankSearchResultBatches([laterBatch], "alpha"),
			...committed,
		];

		expect(
			mergeStableSearchResults(committed, cumulativelyRanked).map(
				searchResultKey,
			),
		).toEqual(["book-book-1", "series-series-1"]);
	});
});
