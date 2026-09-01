import { describe, expect, test } from "bun:test";
import {
	effectiveMediaTime,
	planSeek,
	pointerSeekTime,
	shouldApplyRestoredPosition,
	shouldConfirmPendingSeek,
} from "./seek-plan";

describe("deferred audiobook seeks", () => {
	test("keeps an early seek pending until the media reports the requested position", () => {
		const plan = planSeek({
			time: 137,
			offsets: [],
			totalDuration: 900,
			fileCount: 1,
			currentFileIndex: 0,
			readyState: 0,
			mediaDuration: Number.NaN,
			bookDuration: 900,
		});

		expect(plan).toMatchObject({ fileTime: 137, deferred: true });
		// loadedmetadata may briefly accept currentTime before the stream snaps
		// back to zero. That assignment is not an acknowledgement of the seek.
		expect(shouldConfirmPendingSeek(137, 0, 1)).toBe(false);
		// HAVE_METADATA is not enough: the browser may expose the assigned
		// currentTime and still roll it back before data exists at that position.
		expect(shouldConfirmPendingSeek(137, 137, 1)).toBe(false);
		expect(shouldConfirmPendingSeek(137, 137, 2)).toBe(true);
		expect(effectiveMediaTime(0, 137)).toBe(137);
	});

	test("does not let a late restore overwrite an immediate user seek", () => {
		expect(
			shouldApplyRestoredPosition({ userSeeked: true, savedSeconds: 420 }),
		).toBe(false);
	});
});

describe("seek bar pointer gestures", () => {
	test("resolves the seek on pointer down without waiting for a commit", () => {
		expect(
			pointerSeekTime({
				clientX: 350,
				rect: { left: 100, width: 500 },
				start: 0,
				end: 1_000,
			}),
		).toBe(500);
	});

	test("keeps chapter-scoped seeks in absolute book time", () => {
		expect(
			pointerSeekTime({
				clientX: 75,
				rect: { left: 50, width: 100 },
				start: 300,
				end: 500,
			}),
		).toBe(350);
	});
});
