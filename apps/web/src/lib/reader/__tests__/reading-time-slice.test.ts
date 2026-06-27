import { describe, expect, it } from "bun:test";
import { claimReadingTimeSlice } from "../reading-time-slice";

describe("claimReadingTimeSlice", () => {
	it("returns whole elapsed seconds since the last sync", () => {
		expect(claimReadingTimeSlice(1_000_000, 1_063_400)).toBe(63); // 63.4s floored
	});

	it("floors sub-second slices to 0", () => {
		expect(claimReadingTimeSlice(1_000_000, 1_000_400)).toBe(0);
	});

	// The regression: two syncs firing in the same tick (visibilitychange ->
	// pagehide -> unmount on close) must not double-count the slice. The caller
	// stores `now` as the new baseline synchronously before the await, so the
	// second claim sees the advanced baseline and reports ~0.
	it("does not double-count when claimed twice in the same tick", () => {
		let lastSync = 0;
		const now = 60_000; // both triggers fire at the same wall-clock time

		const first = claimReadingTimeSlice(lastSync, now);
		lastSync = now; // claimed synchronously, before any await

		const second = claimReadingTimeSlice(lastSync, now);

		expect(first).toBe(60);
		expect(second).toBe(0);
		// The sum sent to the server equals the single real slice, not 2x.
		expect(first + second).toBe(60);
	});
});
