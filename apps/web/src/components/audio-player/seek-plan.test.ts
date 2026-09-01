import { describe, expect, test } from "bun:test";
import {
	effectiveMediaTime,
	planSeek,
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
		expect(shouldConfirmPendingSeek(137, 0)).toBe(false);
		expect(shouldConfirmPendingSeek(137, 137)).toBe(true);
		expect(effectiveMediaTime(0, 137)).toBe(137);
	});

	test("does not let a late restore overwrite an immediate user seek", () => {
		expect(
			shouldApplyRestoredPosition({ userSeeked: true, savedSeconds: 420 }),
		).toBe(false);
	});
});
