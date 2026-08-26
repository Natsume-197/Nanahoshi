import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	analyzeAllMatchProposals,
	getRemovalTarget,
	MatchPublicationArtwork,
} from "./read-listen-match-review";

describe("analyzeAllMatchProposals", () => {
	test("continues until every unevaluated audiobook has been analyzed", async () => {
		const batches = [
			{ processedCount: 25, proposalCount: 8, matcherVersion: "rules-v4" },
			{ processedCount: 25, proposalCount: 5, matcherVersion: "rules-v4" },
			{ processedCount: 4, proposalCount: 1, matcherVersion: "rules-v4" },
		];
		const requestedLimits: number[] = [];
		const generateBatch = async (input: { limit: number }) => {
			requestedLimits.push(input.limit);
			const result = batches.shift();
			if (!result) throw new Error("Unexpected extra batch");
			return result;
		};

		const result = await analyzeAllMatchProposals(generateBatch);

		expect(requestedLimits).toEqual([25, 25, 25]);
		expect(result).toEqual({ processedCount: 54, proposalCount: 14 });
	});

	test("checks for remaining work after a full final batch", async () => {
		const batches = [
			{ processedCount: 25, proposalCount: 3 },
			{ processedCount: 0, proposalCount: 0 },
		];
		let callCount = 0;

		const result = await analyzeAllMatchProposals(async () => {
			callCount += 1;
			const batch = batches.shift();
			if (!batch) throw new Error("Unexpected extra batch");
			return batch;
		});

		expect(callCount).toBe(2);
		expect(result).toEqual({ processedCount: 25, proposalCount: 3 });
	});

	test("finishes immediately when there are no audiobooks to analyze", async () => {
		let callCount = 0;

		const result = await analyzeAllMatchProposals(async () => {
			callCount += 1;
			return { processedCount: 0, proposalCount: 0 };
		});

		expect(callCount).toBe(1);
		expect(result).toEqual({ processedCount: 0, proposalCount: 0 });
	});
});

describe("getRemovalTarget", () => {
	test("uses the proposal when a reviewed match was rejected", () => {
		expect(
			getRemovalTarget({
				id: "proposal-1",
				decision: {
					action: "reject",
					selectedEbook: null,
					pairUuid: null,
				},
			}),
		).toEqual({ kind: "proposal", uuid: "proposal-1" });
	});

	test("uses the active pair for an approved reviewed match", () => {
		expect(
			getRemovalTarget({
				id: "proposal-1",
				decision: {
					action: "approve",
					selectedEbook: null,
					pairUuid: "pair-1",
				},
			}),
		).toEqual({ kind: "pair", uuid: "pair-1" });
	});
});

describe("MatchPublicationArtwork", () => {
	test("renders responsive cover artwork when a cover is available", () => {
		const markup = renderToStaticMarkup(
			<MatchPublicationArtwork
				cover="data/covers/example_600w.jpg"
				mediaType="ebook"
			/>,
		);

		expect(markup).toContain("<img");
		expect(markup).toContain("/api/data/covers/example_600w.jpg");
		expect(markup).toContain("srcSet=");
	});

	test("keeps the media icon as the missing-cover fallback", () => {
		const markup = renderToStaticMarkup(
			<MatchPublicationArtwork cover={null} mediaType="audiobook" />,
		);

		expect(markup).not.toContain("<img");
		expect(markup).toContain("<svg");
	});
});
