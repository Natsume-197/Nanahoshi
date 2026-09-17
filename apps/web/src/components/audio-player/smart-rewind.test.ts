import { describe, expect, test } from "bun:test";
import {
	computeSmartRewind,
	SMART_REWIND_LONG_SECONDS,
	SMART_REWIND_SECONDS,
} from "./smart-rewind";

describe("computeSmartRewind", () => {
	test("does not rewind after a short pause", () => {
		expect(computeSmartRewind({ pausedMs: 60_000, currentTime: 1000 })).toBe(0);
	});

	test("rewinds after a long pause", () => {
		expect(
			computeSmartRewind({ pausedMs: 15 * 60 * 1000, currentTime: 1000 }),
		).toBe(SMART_REWIND_SECONDS);
	});

	test("rewinds more after a very long pause", () => {
		expect(
			computeSmartRewind({ pausedMs: 2 * 60 * 60 * 1000, currentTime: 1000 }),
		).toBe(SMART_REWIND_LONG_SECONDS);
	});

	test("never rewinds before zero", () => {
		expect(computeSmartRewind({ pausedMs: 3600_000, currentTime: 5 })).toBe(5);
	});
});
