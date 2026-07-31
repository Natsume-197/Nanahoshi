import { describe, expect, test } from "bun:test";
import {
	MIN_OVERFLOW_PX,
	marqueeVars,
	shouldSweep,
} from "@/components/audio-player/marquee";

describe("shouldSweep", () => {
	test("leaves a title that fits alone", () => {
		expect(shouldSweep(0)).toBe(false);
	});

	test("ignores an overflow too small to be worth animating", () => {
		expect(shouldSweep(MIN_OVERFLOW_PX)).toBe(false);
	});

	test("sweeps once the hidden text passes the threshold", () => {
		expect(shouldSweep(MIN_OVERFLOW_PX + 1)).toBe(true);
	});
});

describe("marqueeVars", () => {
	test("travels the hidden width, towards the start", () => {
		expect(marqueeVars(120)["--marquee-shift"]).toBe("-120px");
	});

	test("holds one speed: twice the distance costs twice the travel time", () => {
		const pause = Number.parseFloat(marqueeVars(0)["--marquee-duration"]);
		const short = Number.parseFloat(marqueeVars(60)["--marquee-duration"]);
		const long = Number.parseFloat(marqueeVars(120)["--marquee-duration"]);

		expect(short - pause).toBeCloseTo((long - pause) / 2);
	});

	test("keeps a pause at the ends even for a hair of overflow", () => {
		expect(
			Number.parseFloat(marqueeVars(1)["--marquee-duration"]),
		).toBeGreaterThan(1);
	});
});
