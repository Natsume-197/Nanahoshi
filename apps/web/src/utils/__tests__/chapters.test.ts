import { describe, expect, it } from "bun:test";
import {
	formatChapterLabel,
	getActiveChapterIndex,
	getChapterMarkerPercents,
} from "../chapters";

describe("formatChapterLabel", () => {
	it("prefixes the 1-based position to the title", () => {
		expect(formatChapterLabel({ title: "序章" }, 0)).toBe("1. 序章");
		expect(formatChapterLabel({ title: "The End" }, 11)).toBe("12. The End");
	});

	it("falls back to a numbered label for an untitled chapter", () => {
		// No "N. Chapter N" doubling — the fallback stands alone.
		expect(formatChapterLabel({ title: null }, 3)).toBe("Chapter 4");
	});

	it("falls back when the chapter is missing entirely", () => {
		expect(formatChapterLabel(undefined, 0)).toBe("Chapter 1");
	});
});

describe("getActiveChapterIndex", () => {
	const chapters = [{ startTime: 0 }, { startTime: 100 }, { startTime: 250 }];

	it("returns the chapter containing the time", () => {
		expect(getActiveChapterIndex(chapters, 0)).toBe(0);
		expect(getActiveChapterIndex(chapters, 150)).toBe(1);
		expect(getActiveChapterIndex(chapters, 9999)).toBe(2);
	});

	it("returns -1 for an empty chapter list", () => {
		expect(getActiveChapterIndex([], 42)).toBe(-1);
	});
});

describe("getChapterMarkerPercents", () => {
	it("maps interior chapter starts to track percentages", () => {
		expect(
			getChapterMarkerPercents([{ startTime: 0 }, { startTime: 50 }], 200),
		).toEqual([25]);
	});

	it("drops the ends and returns nothing for a zero-length book", () => {
		expect(getChapterMarkerPercents([{ startTime: 0 }], 0)).toEqual([]);
	});
});
