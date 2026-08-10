import { describe, expect, test } from "bun:test";
import { nextTrackPosition } from "./track-transition";

describe("nextTrackPosition", () => {
	test("starts the next file at zero so the global clock stays monotonic", () => {
		expect(
			nextTrackPosition({ currentFileIndex: 0, audioFileCount: 2 }),
		).toEqual({ fileIndex: 1, currentTime: 0 });
	});

	test("has no next position after the last file", () => {
		expect(
			nextTrackPosition({ currentFileIndex: 1, audioFileCount: 2 }),
		).toBeNull();
	});
});
