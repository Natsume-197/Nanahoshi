import { describe, expect, test } from "bun:test";
import { shouldDimCarouselEdgeCard } from "./scroll-section";

describe("shouldDimCarouselEdgeCard", () => {
	test("does not darken a card that only slightly crosses the rail edge", () => {
		expect(
			shouldDimCarouselEdgeCard(
				{ left: 0, right: 1000 },
				{ left: 800, right: 1040 },
			),
		).toBe(false);
	});

	test("dims a card when most of it is still outside the rail", () => {
		expect(
			shouldDimCarouselEdgeCard(
				{ left: 0, right: 1000 },
				{ left: 940, right: 1180 },
			),
		).toBe(true);
	});
});
