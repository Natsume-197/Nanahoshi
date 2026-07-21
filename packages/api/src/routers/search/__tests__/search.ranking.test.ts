import { describe, expect, test } from "bun:test";
import { rankTopResults, type TopResultPools } from "../search.ranking";

const emptyPools = (): TopResultPools => ({
	books: [],
	series: [],
	authors: [],
	audiobooks: [],
	collections: [],
	users: [],
});

describe("rankTopResults", () => {
	test("ranks an exact series alias while keeping the canonical display name", () => {
		const pools = emptyPools();
		pools.series.push({
			uuid: "series-1",
			name: "やはり俺の青春ラブコメはまちがっている。",
			aliases: ["Oregairu"],
			cover: null,
			bookCount: 14,
		});
		pools.books.push({
			uuid: "book-1",
			title: "An unrelated secondary-field match",
			filename: "book.epub",
		});

		const [first] = rankTopResults(pools, "oregairu", 5);

		expect(first?.type).toBe("series");
		if (first?.type === "series") {
			expect(first.name).toBe("やはり俺の青春ラブコメはまちがっている。");
		}
	});

	test("secondary-field book hits keep engine order despite review counts", () => {
		// Real-world "konosuba": JP titles never contain the query, so every
		// volume is a secondary match — reviewCount must not scramble the
		// provider's volume order (vol 8 had more reviews than vol 2).
		const pools = emptyPools();
		pools.series.push({
			uuid: "series-1",
			name: "この素晴らしい世界に祝福を!",
			aliases: ["Konosuba"],
			cover: null,
			bookCount: 21,
		});
		pools.books.push(
			{
				uuid: "vol-1",
				title: "この素晴らしい世界に祝福を！　あぁ、駄女神さま",
				filename: "v1.epub",
				amazonReviewCount: 1713,
			},
			{
				uuid: "vol-2",
				title: "この素晴らしい世界に祝福を！(2)",
				filename: "v2.epub",
				amazonReviewCount: 1203,
			},
			{
				uuid: "vol-3",
				title: "この素晴らしい世界に祝福を！(3)",
				filename: "v3.epub",
				amazonReviewCount: 1450,
			},
		);

		const hits = rankTopResults(pools, "konosuba", 5);

		expect(hits[0]?.type).toBe("series");
		expect(
			hits.slice(1).map((h) => (h.type === "book" ? h.uuid : h.type)),
		).toEqual(["vol-1", "vol-2", "vol-3"]);
	});

	test("popularity still disambiguates name-matched entities", () => {
		const pools = emptyPools();
		pools.series.push(
			{
				uuid: "small",
				name: "Overlord",
				aliases: [],
				cover: null,
				bookCount: 2,
			},
			{
				uuid: "big",
				name: "Overlord",
				aliases: [],
				cover: null,
				bookCount: 16,
			},
		);

		const [first] = rankTopResults(pools, "overlord", 5);
		expect(first?.type === "series" && first.uuid).toBe("big");
	});
});
