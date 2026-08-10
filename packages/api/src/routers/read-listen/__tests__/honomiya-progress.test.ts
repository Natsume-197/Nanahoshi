import { describe, expect, test } from "bun:test";
import {
	operationProgressFromHonomiya,
	parseHonomiyaProgressLine,
} from "../honomiya-progress";

describe("Honomiya progress protocol", () => {
	test("parses a versioned chunk event and ignores human stderr", () => {
		expect(parseHonomiyaProgressLine("Chunk 1/4: completed")).toBeNull();
		expect(
			parseHonomiyaProgressLine(
				JSON.stringify({
					schema: "honomiya.progress.v1",
					phase: "transcribe",
					sourceIndex: 0,
					totalSources: 2,
					chunk: 2,
					sourceChunks: 4,
					totalChunks: 10,
					completedChunks: 3,
					state: "completed",
				}),
			),
		).toEqual(expect.objectContaining({ sourceIndex: 0, completedChunks: 3 }));
	});

	test("weights chunks across multiple sequential audio sources", () => {
		const progress = operationProgressFromHonomiya({
			schema: "honomiya.progress.v1",
			phase: "transcribe",
			sourceIndex: 1,
			totalSources: 2,
			chunk: 2,
			sourceChunks: 4,
			totalChunks: 10,
			completedChunks: 7,
			state: "completed",
		});

		expect(progress).toEqual({
			phase: "transcribing",
			percent: 61,
			completed: 7,
			total: 10,
		});
	});

	test("moves to alignment after the last chunk of the last source", () => {
		const progress = operationProgressFromHonomiya({
			schema: "honomiya.progress.v1",
			phase: "transcribe",
			sourceIndex: 0,
			totalSources: 1,
			chunk: 3,
			sourceChunks: 3,
			totalChunks: 3,
			completedChunks: 3,
			state: "cached",
		});

		expect(progress.phase).toBe("aligning");
		expect(progress.percent).toBe(85);
	});
});
