import { describe, expect, test } from "bun:test";
import type { TopHit } from "@nanahoshi-v2/api/routers/search/search.model";
import type { TopResultPools } from "@nanahoshi-v2/api/routers/search/search.ranking";
import {
	rankSearchResultBatches,
	searchResultKey,
} from "./search-result-batches";

const emptyPools = (): TopResultPools => ({
	books: [],
	series: [],
	authors: [],
	audiobooks: [],
	readListen: [],
	collections: [],
	users: [],
});

describe("rankSearchResultBatches", () => {
	test("appends later search pages without duplicates or reordering", () => {
		const first = emptyPools();
		first.books.push({
			uuid: "book-1",
			title: "Alpha",
			filename: "alpha.epub",
		});
		first.audiobooks.push({
			uuid: "audio-1",
			title: "Alpha audio",
			filename: "alpha.m4b",
		});

		const next = emptyPools();
		next.books.push(
			{ uuid: "book-1", title: "Alpha", filename: "alpha.epub" },
			{ uuid: "book-2", title: "Alpha two", filename: "alpha-2.epub" },
		);

		const initial: TopHit[] = [
			{
				type: "book",
				uuid: "book-1",
				title: "Alpha",
				filename: "alpha.epub",
				cover: null,
				authors: [],
			},
		];

		expect(
			rankSearchResultBatches([first, next], "alpha", initial).map(
				searchResultKey,
			),
		).toEqual(["book-book-1", "audiobook-audio-1", "book-book-2"]);
	});
});
