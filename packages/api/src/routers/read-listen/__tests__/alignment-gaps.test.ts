import { describe, expect, test } from "bun:test";
import {
	isAlignmentIncomplete,
	longestAlignmentGapMs,
} from "../alignment-gaps";

const cue = (audioFileIndex: number, startMs: number, endMs: number) => ({
	audioFileIndex,
	startMs,
	endMs,
});

describe("longestAlignmentGapMs", () => {
	test("measures the longest stretch between two aligned sentences", () => {
		expect(
			longestAlignmentGapMs([
				cue(0, 0, 1_000),
				cue(0, 3_000, 4_000),
				cue(0, 2_148_000, 2_150_000),
			]),
		).toBe(2_144_000);
	});

	test("ignores an intro before the first sentence and credits after the last", () => {
		expect(
			longestAlignmentGapMs([
				cue(0, 600_000, 601_000),
				cue(0, 602_000, 603_000),
			]),
		).toBe(1_000);
	});

	test("does not bridge a gap across audio files", () => {
		expect(
			longestAlignmentGapMs([cue(0, 0, 1_000), cue(1, 900_000, 901_000)]),
		).toBe(0);
	});

	test("does not count overlapping cues as a gap", () => {
		expect(
			longestAlignmentGapMs([
				cue(0, 0, 10_000),
				cue(0, 2_000, 3_000),
				cue(0, 11_000, 12_000),
			]),
		).toBe(1_000);
	});
});

describe("isAlignmentIncomplete", () => {
	test("flags a missing section but not a narrated illustration", () => {
		expect(isAlignmentIncomplete(145_000)).toBe(false);
		expect(isAlignmentIncomplete(2_148_000)).toBe(true);
		expect(isAlignmentIncomplete(null)).toBe(false);
	});
});
