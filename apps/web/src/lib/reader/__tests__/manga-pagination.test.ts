import { describe, expect, test } from "bun:test";
import {
	buildMangaSpreads,
	resolveMangaReadingDirection,
} from "../manga-pagination";

describe("buildMangaSpreads", () => {
	test("pairs from the first page when double-page is explicitly selected", () => {
		expect(buildMangaSpreads(6, true)).toEqual([
			[0, 1],
			[2, 3],
			[4, 5],
		]);
	});

	test("keeps landscape pages alone without breaking the following parity", () => {
		expect(buildMangaSpreads(7, true, new Set([3]))).toEqual([
			[0, 1],
			[2],
			[3],
			[4, 5],
			[6],
		]);
	});

	test("uses one logical page when spread mode is disabled", () => {
		expect(buildMangaSpreads(4, false)).toEqual([[0], [1], [2], [3]]);
	});
});

describe("resolveMangaReadingDirection", () => {
	test("honours an explicit override", () => {
		expect(resolveMangaReadingDirection("ltr", "ja")).toBe("ltr");
		expect(resolveMangaReadingDirection("rtl", "en")).toBe("rtl");
	});

	test("uses right-to-left for Japanese content in auto mode", () => {
		expect(resolveMangaReadingDirection("auto", "ja-JP")).toBe("rtl");
		expect(resolveMangaReadingDirection("auto", "en-US")).toBe("ltr");
	});

	test("prefers EPUB page progression over the language fallback", () => {
		expect(resolveMangaReadingDirection("auto", "en", "rtl")).toBe("rtl");
		expect(resolveMangaReadingDirection("auto", "ja", "ltr")).toBe("ltr");
	});
});
