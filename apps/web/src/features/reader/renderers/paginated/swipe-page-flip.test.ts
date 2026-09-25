import { describe, expect, test } from "bun:test";
import { swipePageFlipDirection } from "./swipe-page-flip";

describe("swipePageFlipDirection", () => {
	test("horizontal text advances on a leftward swipe", () => {
		expect(swipePageFlipDirection(-80, 5, false)).toBe(1);
		expect(swipePageFlipDirection(80, 5, false)).toBe(-1);
	});

	test("tategaki advances on a rightward swipe", () => {
		expect(swipePageFlipDirection(80, 5, true)).toBe(1);
		expect(swipePageFlipDirection(-80, 5, true)).toBe(-1);
	});

	test("tategaki ignores vertical swipes", () => {
		expect(swipePageFlipDirection(5, -80, true)).toBeNull();
		expect(swipePageFlipDirection(5, 80, true)).toBeNull();
	});

	test("ignores short or diagonal-dominant swipes", () => {
		expect(swipePageFlipDirection(30, 0, false)).toBeNull();
		expect(swipePageFlipDirection(60, 70, true)).toBeNull();
	});
});
