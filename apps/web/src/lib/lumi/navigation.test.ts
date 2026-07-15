import { describe, expect, it } from "bun:test";
import { pageDeltaForSwipe, pageDeltaForWheel } from "./navigation";

describe("Lumi page gesture direction", () => {
	it("maps horizontal-reading gestures to reading order", () => {
		expect(pageDeltaForWheel(30, 2, false)).toBe(1);
		expect(pageDeltaForWheel(-30, 2, false)).toBe(-1);
		expect(pageDeltaForSwipe(-50, 2, false, 40)).toBe(1);
		expect(pageDeltaForSwipe(50, 2, false, 40)).toBe(-1);
	});

	it("uses vertical swipes and reverses horizontal wheel gestures in vertical mode", () => {
		expect(pageDeltaForWheel(30, 2, true)).toBe(-1);
		expect(pageDeltaForWheel(-30, 2, true)).toBe(1);
		expect(pageDeltaForWheel(2, 30, true)).toBe(1);
		expect(pageDeltaForSwipe(2, -50, true, 40)).toBe(1);
		expect(pageDeltaForSwipe(2, 50, true, 40)).toBe(-1);
	});

	it("ignores zero, short, and cross-axis-dominant gestures", () => {
		expect(pageDeltaForWheel(0, 0, false)).toBe(0);
		expect(pageDeltaForSwipe(-39, 0, false, 40)).toBe(0);
		expect(pageDeltaForSwipe(-40, 50, false, 40)).toBe(0);
		expect(pageDeltaForSwipe(50, -40, true, 40)).toBe(0);
	});
});
