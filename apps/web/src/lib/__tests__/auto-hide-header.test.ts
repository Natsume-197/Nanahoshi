import { describe, expect, it } from "bun:test";
import {
	ALWAYS_SHOWN_ABOVE,
	type AutoHideState,
	DIRECTION_DELTA,
	resolveAutoHide,
} from "../auto-hide-header";

const shown = (lastY = 0): AutoHideState => ({ lastY, hidden: false });
const gone = (lastY: number): AutoHideState => ({ lastY, hidden: true });

/** Replays a run of offsets, as the scroll handler would. */
const scrollThrough = (start: AutoHideState, offsets: number[]) =>
	offsets.reduce(resolveAutoHide, start);

describe("resolveAutoHide", () => {
	it("keeps the bar while near the top", () => {
		expect(resolveAutoHide(shown(), 0).hidden).toBe(false);
		expect(resolveAutoHide(shown(), ALWAYS_SHOWN_ABOVE).hidden).toBe(false);
	});

	it("brings the bar back when scrolling up into the top zone", () => {
		// Even mid-gesture heading down, crossing back into the top zone wins.
		expect(resolveAutoHide(gone(400), 20).hidden).toBe(false);
	});

	it("hides once scrolling down past the threshold", () => {
		const next = resolveAutoHide(shown(100), 100 + DIRECTION_DELTA);

		expect(next.hidden).toBe(true);
		expect(next.lastY).toBe(100 + DIRECTION_DELTA);
	});

	it("reveals again on a deliberate scroll up", () => {
		expect(resolveAutoHide(gone(400), 400 - DIRECTION_DELTA).hidden).toBe(
			false,
		);
	});

	it("ignores jitter below the delta", () => {
		const start = gone(400);

		for (const y of [401, 405, 396, 400, 400 + DIRECTION_DELTA - 1]) {
			const next = resolveAutoHide(start, y);
			expect(next.hidden).toBe(true);
			// State is returned untouched, so the reference anchor never drifts.
			expect(next).toBe(start);
		}
	});

	it("accumulates slow drift instead of discarding it", () => {
		// Each step is under the delta, so no single one flips the bar — but they
		// must still add up rather than resetting the anchor every frame.
		const end = scrollThrough(shown(200), [203, 206, 209, 212]);

		expect(end.hidden).toBe(true);
	});

	it("does not flip on a rubber-band bounce at speed", () => {
		// Down hard, then the overscroll settles back a few pixels.
		const end = scrollThrough(shown(300), [360, 358, 356, 355]);

		expect(end.hidden).toBe(true);
	});

	it("survives a full down-then-up gesture", () => {
		const down = scrollThrough(shown(0), [40, 120, 260, 500]);
		expect(down.hidden).toBe(true);

		const up = scrollThrough(down, [460, 380, 300]);
		expect(up.hidden).toBe(false);

		// ...and back to the very top, still shown.
		expect(scrollThrough(up, [120, 30, 0]).hidden).toBe(false);
	});

	it("never hides inside the always-shown zone, whatever the direction", () => {
		for (let y = 0; y <= ALWAYS_SHOWN_ABOVE; y += 8) {
			expect(resolveAutoHide(gone(0), y).hidden).toBe(false);
		}
	});
});
