import "@/test-utils/setup-dom";
import { describe, expect, it } from "bun:test";
import { readerColumnHeight, viewportHeight } from "../viewport";

describe("readerColumnHeight", () => {
	const vh = viewportHeight();

	it("is the full viewport height in horizontal mode regardless of max", () => {
		expect(readerColumnHeight(false, 0)).toBe(vh);
		expect(readerColumnHeight(false, 100)).toBe(vh);
	});

	it("is the full viewport height in vertical mode when no max is set", () => {
		expect(readerColumnHeight(true, 0)).toBe(vh);
	});

	it("caps to the max in vertical mode when the max is below the viewport", () => {
		expect(readerColumnHeight(true, 100)).toBe(100);
	});

	it("ignores a max larger than the viewport", () => {
		expect(readerColumnHeight(true, vh + 1000)).toBe(vh);
	});
});
