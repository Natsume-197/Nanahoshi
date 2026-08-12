import { describe, expect, test } from "bun:test";
import type {
	MixRow,
	RecommendationItem,
} from "@nanahoshi-v2/api/routers/recommendations/recommendations.model";
import { mergeRecommendationMixes } from "./recommendation-mixes-utils";

function item(
	uuid: string,
	reason: "recommended" | "popular",
): RecommendationItem {
	return {
		kind: "book",
		seriesUuid: null,
		seriesName: null,
		book: {
			uuid,
			title: uuid,
			filename: `${uuid}.epub`,
			cover: null,
			mainColor: null,
			authors: [],
			mediaType: "ebook",
		},
		reason: { type: reason, refTitle: null },
		score: reason === "popular" ? 0.4 : 0.8,
	};
}

describe("mergeRecommendationMixes", () => {
	test("round-robins personalized mixes before appending popular backfill", () => {
		const mixes: MixRow[] = [
			{
				mixIndex: 0,
				anchorTitle: "First taste",
				items: [
					item("personal-1", "recommended"),
					item("personal-3", "recommended"),
				],
			},
			{
				mixIndex: 1,
				anchorTitle: "Second taste",
				items: [
					item("personal-2", "recommended"),
					item("personal-4", "recommended"),
				],
			},
			{
				mixIndex: 2,
				anchorTitle: null,
				items: [item("popular-1", "popular"), item("popular-2", "popular")],
			},
		];

		expect(
			mergeRecommendationMixes(mixes, 6).map((entry) => entry.book.uuid),
		).toEqual([
			"personal-1",
			"personal-2",
			"personal-3",
			"personal-4",
			"popular-1",
			"popular-2",
		]);
	});

	test("deduplicates display volumes across personalized and fallback mixes", () => {
		const duplicate = item("same-book", "popular");
		const mixes: MixRow[] = [
			{
				mixIndex: 0,
				anchorTitle: "Taste",
				items: [item("same-book", "recommended")],
			},
			{
				mixIndex: 1,
				anchorTitle: null,
				items: [duplicate, item("other-book", "popular")],
			},
		];

		expect(
			mergeRecommendationMixes(mixes, 3).map((entry) => entry.book.uuid),
		).toEqual(["same-book", "other-book"]);
	});
});
