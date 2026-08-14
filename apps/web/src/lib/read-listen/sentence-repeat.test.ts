import { describe, expect, it } from "bun:test";
import {
	nextSentenceRepeatMode,
	resolveSentenceRepeatBoundary,
} from "./sentence-repeat";

describe("sentence repeat", () => {
	it("cycles from one repeat to a loop and then turns off", () => {
		expect(nextSentenceRepeatMode("off")).toBe("once");
		expect(nextSentenceRepeatMode("once")).toBe("loop");
		expect(nextSentenceRepeatMode("loop")).toBe("off");
	});

	it("finishes a one-time repeat at the sentence boundary", () => {
		expect(
			resolveSentenceRepeatBoundary({
				mode: "once",
				playheadMs: 1_000,
				cueEndMs: 1_000,
				loopSeekPending: false,
			}),
		).toBe("finish");
	});

	it("loops once per crossed sentence boundary", () => {
		expect(
			resolveSentenceRepeatBoundary({
				mode: "loop",
				playheadMs: 1_001,
				cueEndMs: 1_000,
				loopSeekPending: false,
			}),
		).toBe("loop");
		expect(
			resolveSentenceRepeatBoundary({
				mode: "loop",
				playheadMs: 1_001,
				cueEndMs: 1_000,
				loopSeekPending: true,
			}),
		).toBe("none");
	});
});
