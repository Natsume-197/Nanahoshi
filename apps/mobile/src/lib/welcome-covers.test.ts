import { expect, test } from "bun:test";
import {
	marqueeDistance,
	type ShelfCover,
	welcomeCoverRows,
} from "./welcome-covers";

test("no cover shows up twice across the shelf", () => {
	const all = welcomeCoverRows()
		.flat()
		.map((cover) => cover.uri);
	expect(new Set(all).size).toBe(all.length);
});

test("every row mixes books and audiobooks", () => {
	for (const row of welcomeCoverRows()) {
		expect(row.some((cover) => cover.square)).toBe(true);
		expect(row.some((cover) => !cover.square)).toBe(true);
	}
});

test("a mixed row loops after exactly one copy of itself", () => {
	const row: ShelfCover[] = [
		{ uri: "a", square: false },
		{ uri: "b", square: true },
	];
	// A 150-tall row: a 100-wide book, a 150-wide audiobook, 12 after each.
	expect(marqueeDistance(row, 150, 12)).toBe(274);
});
