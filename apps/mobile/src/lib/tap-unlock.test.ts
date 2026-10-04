import { describe, expect, test } from "bun:test";
import {
	NO_TAPS,
	registerTap,
	TAPS_TO_UNLOCK,
	type TapState,
} from "./tap-unlock";

function tapAt(times: number[]) {
	let state: TapState = NO_TAPS;
	let remaining = TAPS_TO_UNLOCK;
	for (const now of times) {
		({ state, remaining } = registerTap(state, now));
	}
	return remaining;
}

describe("registerTap", () => {
	test("seven quick taps unlock", () => {
		expect(
			tapAt([10_000, 10_300, 10_600, 10_900, 11_200, 11_500, 11_800]),
		).toBe(0);
	});

	test("counts down while tapping", () => {
		expect(tapAt([10_000, 10_300, 10_600])).toBe(TAPS_TO_UNLOCK - 3);
	});

	test("a pause starts the count over", () => {
		expect(
			tapAt([10_000, 10_300, 10_600, 10_900, 11_200, 11_500, 20_000]),
		).toBe(TAPS_TO_UNLOCK - 1);
	});
});
