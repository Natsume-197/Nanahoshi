import { describe, expect, test } from "bun:test";
import { isChromeTap } from "./reader-content-click";

const phone = { left: 0, width: 400, coarsePointer: true, selecting: false };

describe("isChromeTap", () => {
	test("a tap in the middle of the page opens the menu on a phone", () => {
		expect(isChromeTap({ ...phone, x: 200 })).toBe(true);
	});

	test("taps near the edges are left for reading", () => {
		expect(isChromeTap({ ...phone, x: 40 })).toBe(false);
		expect(isChromeTap({ ...phone, x: 360 })).toBe(false);
	});

	test("desktop clicks keep ttu's behaviour", () => {
		expect(isChromeTap({ ...phone, x: 200, coarsePointer: false })).toBe(false);
	});

	test("finishing a text selection is not a tap", () => {
		expect(isChromeTap({ ...phone, x: 200, selecting: true })).toBe(false);
	});
});
