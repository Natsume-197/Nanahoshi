import { describe, expect, test } from "bun:test";
import {
	collectionMatchesFormat,
	type LibraryFormat,
	parseLibraryFormat,
} from "./library-format";

const counts = (ebookCount = 0, audiobookCount = 0) => ({
	ebookCount,
	audiobookCount,
});

describe("parseLibraryFormat", () => {
	test("keeps the two real formats", () => {
		expect(parseLibraryFormat("ebook")).toBe("ebook");
		expect(parseLibraryFormat("audiobook")).toBe("audiobook");
	});

	test.each([["all"], [""], ["books"], [null], [undefined], [1]])(
		"falls back to all for %p",
		(value) => {
			expect(parseLibraryFormat(value)).toBe("all");
		},
	);
});

describe("collectionMatchesFormat", () => {
	test("unfiltered keeps everything", () => {
		expect(collectionMatchesFormat(counts(3, 1), "all")).toBe(true);
		expect(collectionMatchesFormat(counts(), "all")).toBe(true);
	});

	test("audiobook keeps only collections holding audiobooks", () => {
		expect(collectionMatchesFormat(counts(3, 1), "audiobook")).toBe(true);
		expect(collectionMatchesFormat(counts(5, 0), "audiobook")).toBe(false);
	});

	test("ebook keeps ebook collections", () => {
		expect(collectionMatchesFormat(counts(5, 0), "ebook")).toBe(true);
		expect(collectionMatchesFormat(counts(0, 5), "ebook")).toBe(false);
	});

	test("an empty collection stays visible under ebook", () => {
		expect(collectionMatchesFormat(counts(), "ebook")).toBe(true);
		expect(collectionMatchesFormat(counts(), "audiobook")).toBe(false);
	});

	test("keeps lazy-count collections discoverable in both tabs", () => {
		const lazy = { ebookCount: null, audiobookCount: null };
		expect(collectionMatchesFormat(lazy, "ebook")).toBe(true);
		expect(collectionMatchesFormat(lazy, "audiobook")).toBe(true);
	});

	test("covers every format in the union", () => {
		const all: LibraryFormat[] = ["all", "ebook", "audiobook"];
		for (const format of all) {
			expect(typeof collectionMatchesFormat(counts(1, 1), format)).toBe(
				"boolean",
			);
		}
	});
});
