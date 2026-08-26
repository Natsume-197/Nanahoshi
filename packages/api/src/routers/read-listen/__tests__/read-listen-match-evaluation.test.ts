import { describe, expect, test } from "bun:test";
import {
	type EvaluationPublication,
	evaluateReadListenMatches,
} from "../read-listen-match-evaluation";

function publication(
	id: number,
	mediaType: "ebook" | "audiobook",
	title: string,
): EvaluationPublication {
	return {
		id,
		serverId: "server-1",
		mediaType,
		title,
		filename: title,
		authors: [{ name: "Author" }],
		series: [],
	};
}

describe("evaluateReadListenMatches", () => {
	test("ranks a confirmed match against hard negatives", () => {
		const report = evaluateReadListenMatches(
			[
				publication(1, "audiobook", "Series 2巻"),
				publication(2, "ebook", "Series 2巻"),
				publication(3, "ebook", "Series 3巻"),
				publication(4, "ebook", "Another book"),
			],
			[{ serverId: "server-1", audiobookId: 1, ebookId: 2 }],
		);

		expect(report).toEqual(
			expect.objectContaining({
				evaluatedCount: 1,
				top1: 1,
				top3: 1,
				positiveEligibility: 1,
				proposalPrecision: 1,
			}),
		);
		expect(report.failures).toEqual([]);
	});
});
