import { describe, expect, test } from "bun:test";
import type { ReadListenCue } from "@nanahoshi/api/routers/read-listen/manifest";
import {
	createReadListenTimeline,
	findActiveReadListenWord,
	findAdjacentReadListenCue,
	findReadListenCue,
	findReadListenCueIndex,
	isReadListenUnsyncedStretch,
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

	test("sorts the timeline before binary-searching seeks", () => {
		const timeline = createReadListenTimeline([...cues].reverse(), [
			{ index: 0, duration: 10 },
			{ index: 1, duration: 20 },
		]);

		expect(timeline.map((cue) => cue.id)).toEqual(["first", "second"]);
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

	test("treats a long stretch with no sentence as unsynced, not a pause", () => {
		const timeline = createReadListenTimeline(
			[
				{ ...cues[0], startMs: 1_000, endMs: 2_000 },
				{ ...cues[1], audioFileIndex: 0, startMs: 40_000, endMs: 41_000 },
			],
			[{ index: 0, duration: 60 }],
		);
		const at = (ms: number) =>
			isReadListenUnsyncedStretch(
				resolveReadListenTimelinePosition(timeline, ms),
				ms,
			);

		expect(at(1_500)).toBe(false);
		expect(at(6_000)).toBe(false);
		expect(at(20_000)).toBe(true);
		expect(at(40_500)).toBe(false);
		expect(at(500)).toBe(false);
	});

	test("treats narration long before the first sentence as unsynced", () => {
		const timeline = createReadListenTimeline(
			[{ ...cues[0], startMs: 30_000, endMs: 31_000 }],
			[{ index: 0, duration: 60 }],
		);

		expect(
			isReadListenUnsyncedStretch(
				resolveReadListenTimelinePosition(timeline, 5_000),
				5_000,
			),
		).toBe(true);
	});

	test("maps Honomiya EPUB references to reader section ids", () => {
		expect(toReaderSectionReference("p-0001.xhtml", "epub")).toBe(
			"nanahoshi-epub-p-0001-xhtml",
		);
	});

	test("maps word timings onto the global clock and resolves the active word", () => {
		const timeline = createReadListenTimeline(
			[
				{
					id: "c-words",
					text: {
						kind: "text-quote",
						sectionRef: "ch2.xhtml",
						exact: "Hello world.",
					},
					audioFileIndex: 1,
					startMs: 500,
					endMs: 2500,
					words: [
						{ start: 0, end: 5, text: "Hello", startMs: 500, endMs: 1400 },
						{ start: 6, end: 11, text: "world", startMs: 1400, endMs: 2500 },
					],
				},
			],
			[
				{ index: 0, duration: 10 },
				{ index: 1, duration: 20 },
			],
		);
		const cue = timeline[0];
		if (!cue) throw new Error("Expected timeline cue");
		expect(cue.words?.[0]?.globalStartMs).toBe(10_500);
		expect(cue.words?.[1]?.globalEndMs).toBe(12_500);
		expect(findActiveReadListenWord(cue, 10_499)).toBeUndefined();
		expect(findActiveReadListenWord(cue, 10_800)?.text).toBe("Hello");
		expect(findActiveReadListenWord(cue, 11_400)?.text).toBe("world");
		expect(findActiveReadListenWord(cue, 12_500)).toBeUndefined();
	});
});
