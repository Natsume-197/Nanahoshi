import { expect, test } from "bun:test";
import { isLeftover } from "./cache-leftovers";

const cache = "file:///data/user/0/app/cache";

test("tab icons rendered on every launch are leftovers", () => {
	expect(
		isLeftover(`${cache}/0001f45b-a170-4a20-9574-8f74af508af9.png`, 563),
	).toBe(true);
});

test("only the big UI fonts go; the symbol fonts still load from the cache", () => {
	expect(
		isLeftover(`${cache}/ExponentAsset-0344edb16f4a6e5a.ttf`, 6_166_120),
	).toBe(true);
	expect(isLeftover(`${cache}/ExponentAsset-c87cecd05fa927fd.ttf`, 2_044)).toBe(
		false,
	);
});

test("anything else in the cache stays", () => {
	expect(isLeftover(`${cache}/ImageManipulator/a.png`, 563)).toBe(false);
	expect(isLeftover(`${cache}/cover.png`, 563)).toBe(false);
});
