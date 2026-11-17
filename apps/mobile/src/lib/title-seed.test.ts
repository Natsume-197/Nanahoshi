import { beforeEach, describe, expect, test } from "bun:test";
import {
	authorKey,
	forgetSeeds,
	rememberSeed,
	seedPeople,
	titleSeed,
} from "./title-seed";

const seed = (title: string) => ({
	title,
	cover: null,
	color: null,
	authors: [],
});

describe("seedPeople", () => {
	test("a full byline keeps every author, in order", () => {
		expect(
			seedPeople([
				{ uuid: "b", name: "Bashō" },
				{ uuid: "a", name: "Akutagawa" },
			]),
		).toEqual([
			{ uuid: "b", name: "Bashō" },
			{ uuid: "a", name: "Akutagawa" },
		]);
	});

	test("an author without a link drops the byline instead of half of it", () => {
		expect(
			seedPeople([{ uuid: "a", name: "Akutagawa" }, { name: "Unlinked" }]),
		).toEqual([]);
		expect(seedPeople([{ uuid: "a", name: "  " }])).toEqual([]);
		expect(seedPeople(null)).toEqual([]);
	});
});

test("a tile's authors and the detail's map to one query key in any order", () => {
	expect(authorKey([{ uuid: "b" }, { uuid: "a" }])).toEqual(
		authorKey([{ uuid: "a" }, { uuid: "b" }]),
	);
});

describe("seeds", () => {
	beforeEach(forgetSeeds);

	test("a book and an audiobook with the same id keep their own seeds", () => {
		rememberSeed("book", "x", seed("Book"));
		rememberSeed("audiobook", "x", seed("Audio"));
		expect(titleSeed("book", "x")?.title).toBe("Book");
		expect(titleSeed("audiobook", "x")?.title).toBe("Audio");
		expect(titleSeed("book", "y")).toBeNull();
	});

	test("old taps are forgotten, a title tapped again is kept", () => {
		rememberSeed("book", "first", seed("First"));
		for (let index = 0; index < 63; index++)
			rememberSeed("book", `filler-${index}`, seed("Filler"));
		rememberSeed("book", "first", seed("First again"));
		rememberSeed("book", "one-more", seed("One more"));
		expect(titleSeed("book", "first")?.title).toBe("First again");
		expect(titleSeed("book", "filler-0")).toBeNull();
	});
});
