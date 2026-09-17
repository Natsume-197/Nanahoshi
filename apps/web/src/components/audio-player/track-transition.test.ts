import { describe, expect, test } from "bun:test";
import { findNextInSeries, nextTrackPosition } from "./track-transition";

describe("nextTrackPosition", () => {
	test("starts the next file at zero so the global clock stays monotonic", () => {
		expect(
			nextTrackPosition({ currentFileIndex: 0, audioFileCount: 2 }),
		).toEqual({ fileIndex: 1, currentTime: 0 });
	});

	test("has no next position after the last file", () => {
		expect(
			nextTrackPosition({ currentFileIndex: 1, audioFileCount: 2 }),
		).toBeNull();
	});
});

describe("findNextInSeries", () => {
	const books = [{ uuid: "a" }, { uuid: "b" }, { uuid: "c" }];

	test("returns the book after the current one in listing order", () => {
		expect(findNextInSeries({ currentUuid: "a", seriesBooks: books })).toEqual({
			uuid: "b",
		});
	});

	test("returns null at the end of the series", () => {
		expect(
			findNextInSeries({ currentUuid: "c", seriesBooks: books }),
		).toBeNull();
	});

	test("returns null when the current book is not in the list", () => {
		expect(
			findNextInSeries({ currentUuid: "z", seriesBooks: books }),
		).toBeNull();
	});
});
