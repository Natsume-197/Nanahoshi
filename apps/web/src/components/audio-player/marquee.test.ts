import { describe, expect, it } from "bun:test";
import {
	MARQUEE_GAP_PX,
	MIN_OVERFLOW_PX,
	marqueeVars,
	shouldLoop,
} from "./marquee";

describe("shouldLoop", () => {
	it("leaves a title that fits, or barely overflows, to the ellipsis", () => {
		expect(shouldLoop(0)).toBe(false);
		expect(shouldLoop(MIN_OVERFLOW_PX)).toBe(false);
	});

	it("loops once the hidden tail is worth reading", () => {
		expect(shouldLoop(MIN_OVERFLOW_PX + 1)).toBe(true);
	});
});

describe("marqueeVars", () => {
	it("travels the whole title plus its trailing gap, so the loop has no seam", () => {
		expect(marqueeVars(200)["--marquee-shift"]).toBe(
			`-${200 + MARQUEE_GAP_PX}px`,
		);
	});

	it("never runs backwards: the shift is always negative", () => {
		for (const width of [1, 120, 4000]) {
			expect(marqueeVars(width)["--marquee-shift"]).toStartWith("-");
		}
	});

	it("holds one reading pace, so a longer title takes proportionally longer", () => {
		const shortDistance = 100 + MARQUEE_GAP_PX;
		const longDistance = 400 + MARQUEE_GAP_PX;
		const seconds = (vars: Record<string, string>) =>
			Number.parseFloat(vars["--marquee-duration"]);

		expect(seconds(marqueeVars(400)) / seconds(marqueeVars(100))).toBeCloseTo(
			longDistance / shortDistance,
			5,
		);
	});

	it("exposes the gap the second copy is spaced by", () => {
		expect(marqueeVars(200)["--marquee-gap"]).toBe(`${MARQUEE_GAP_PX}px`);
	});
});
