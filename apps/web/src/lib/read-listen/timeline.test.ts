import { describe, expect, test } from "bun:test";
import type { ReadListenCue } from "@nanahoshi-v2/read-listen/manifest";
import {
	createReadListenTimeline,
	findAdjacentReadListenCue,
	findReadListenCue,
	findReadListenCueIndex,
	resolveReadListenTimelinePosition,
	toReaderSectionReference,
} from "./timeline";

const cues: ReadListenCue[] = [
	{
		id: "first",
		text: { kind: "text-quote", sectionRef: "one.xhtml", exact: "One." },
		audioFileIndex: 0,
		startMs: 100,
		endMs: 500,
	},
	{
		id: "second",
		text: { kind: "text-quote", sectionRef: "two.xhtml", exact: "Two." },
		audioFileIndex: 1,
		startMs: 200,
		endMs: 700,
	},
];

describe("Read & Listen timeline", () => {
	test("maps track-local cues onto the audiobook global clock", () => {
		const timeline = createReadListenTimeline(cues, [
			{ index: 0, duration: 10 },
			{ index: 1, duration: 20 },
		]);

		expect(timeline[1]).toMatchObject({
			globalStartMs: 10_200,
			globalEndMs: 10_700,
		});
		expect(findReadListenCue(timeline, 10_300)?.id).toBe("second");
	});

	test("does not carry a cue across silence", () => {
		const timeline = createReadListenTimeline(cues, [
			{ index: 0, duration: 10 },
			{ index: 1, duration: 20 },
		]);

		expect(findReadListenCue(timeline, 50)).toBeUndefined();
		expect(findReadListenCue(timeline, 600)).toBeUndefined();
	});

	test("returns the active cue index without filling narration gaps", () => {
		const timeline = createReadListenTimeline(cues, [
			{ index: 0, duration: 10 },
			{ index: 1, duration: 20 },
		]);

		expect(findReadListenCueIndex(timeline, 100)).toBe(0);
		expect(findReadListenCueIndex(timeline, 499)).toBe(0);
		expect(findReadListenCueIndex(timeline, 500)).toBe(-1);
		expect(findReadListenCueIndex(timeline, 10_200)).toBe(1);
		expect(findReadListenCueIndex(timeline, 10_700)).toBe(-1);
	});

	test("finds previous and next sentences from cues and narration gaps", () => {
		const timeline = createReadListenTimeline(cues, [
			{ index: 0, duration: 10 },
			{ index: 1, duration: 20 },
		]);

		expect(findAdjacentReadListenCue(timeline, 300, -1)).toBeUndefined();
		expect(findAdjacentReadListenCue(timeline, 300, 1)?.id).toBe("second");
		expect(findAdjacentReadListenCue(timeline, 600, -1)?.id).toBe("first");
		expect(findAdjacentReadListenCue(timeline, 600, 1)?.id).toBe("second");
		expect(findAdjacentReadListenCue(timeline, 10_300, -1)?.id).toBe("first");
		expect(findAdjacentReadListenCue(timeline, 10_300, 1)).toBeUndefined();
	});

	test("resolves active and adjacent cues with one shared boundary decision", () => {
		const timeline = createReadListenTimeline(cues, [
			{ index: 0, duration: 10 },
			{ index: 1, duration: 20 },
		]);

		expect(resolveReadListenTimelinePosition(timeline, 100)).toEqual({
			activeIndex: 0,
			activeCue: timeline[0],
			previousCue: undefined,
			nextCue: timeline[1],
		});
		expect(resolveReadListenTimelinePosition(timeline, 700)).toEqual({
			activeIndex: -1,
			activeCue: undefined,
			previousCue: timeline[0],
			nextCue: timeline[1],
		});
	});

	test("maps Honomiya EPUB references to reader section ids", () => {
		expect(toReaderSectionReference("p-0001.xhtml", "epub")).toBe(
			"ttu-epub-p-0001-xhtml",
		);
	});
});
