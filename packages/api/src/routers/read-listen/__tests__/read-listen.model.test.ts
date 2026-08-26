import { describe, expect, test } from "bun:test";
import {
	DecideReadListenMatchProposalInput,
	GenerateReadListenAlignmentInput,
} from "../read-listen.model";

const pairUuid = "11111111-1111-4111-8111-111111111111";

describe("GenerateReadListenAlignmentInput", () => {
	test("leaves optional SRT verification disabled by default", () => {
		const parsed = GenerateReadListenAlignmentInput.parse({
			pairUuid,
			mode: "timed-text",
			timedTextFilenames: ["book.srt"],
		});

		expect(parsed.verifyTimedText).toBe(false);
	});

	test("accepts explicit SRT verification only for timed text", () => {
		expect(
			GenerateReadListenAlignmentInput.parse({
				pairUuid,
				mode: "timed-text",
				timedTextFilenames: ["book.srt"],
				verifyTimedText: true,
			}).verifyTimedText,
		).toBe(true);
		expect(() =>
			GenerateReadListenAlignmentInput.parse({
				pairUuid,
				mode: "provider",
				verifyTimedText: true,
			}),
		).toThrow("cannot verify timed-text");
	});
});

describe("DecideReadListenMatchProposalInput", () => {
	test("requires a replacement ebook only when correcting", () => {
		expect(() =>
			DecideReadListenMatchProposalInput.parse({
				proposalUuid: pairUuid,
				action: "correct",
			}),
		).toThrow();
		expect(
			DecideReadListenMatchProposalInput.parse({
				proposalUuid: pairUuid,
				action: "reject",
			}),
		).toEqual({ proposalUuid: pairUuid, action: "reject" });
	});
});
