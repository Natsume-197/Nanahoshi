import { describe, expect, test } from "bun:test";
import type { ReadListenCue } from "@nanahoshi-v2/read-listen/manifest";
import {
	createReadListenTimeline,
	findReadListenCue,
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

	test("maps Honomiya EPUB references to reader section ids", () => {
		expect(toReaderSectionReference("p-0001.xhtml", "epub")).toBe(
			"ttu-epub-p-0001-xhtml",
		);
	});
});
