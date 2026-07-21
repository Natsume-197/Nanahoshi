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
});
