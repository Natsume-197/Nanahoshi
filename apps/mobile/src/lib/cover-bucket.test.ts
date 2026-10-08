import { expect, test } from "bun:test";
import { coverBucket } from "./cover-bucket";

test("a tile a little wider than a warm rung reads that rung", () => {
	// Home rail tile 150pt @3x, Android grid 178dp @2.625.
	expect(coverBucket(450)).toBe(400);
	expect(coverBucket(467)).toBe(400);
});

test("a slot clearly wider than the rung below gets the next one", () => {
	expect(coverBucket(505)).toBe(600);
	expect(coverBucket(600)).toBe(600);
});

test("exact rungs and slots past the ladder", () => {
	expect(coverBucket(300)).toBe(300);
	expect(coverBucket(5000)).toBe(2048);
});
