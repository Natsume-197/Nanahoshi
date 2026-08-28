import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { shouldDimCarouselEdgeCard } from "./scroll-section";

const scrollSectionSource = readFileSync(
	new URL("./scroll-section.tsx", import.meta.url),
	"utf8",
);
const continueSectionSource = readFileSync(
	new URL("../dashboard/home/continue-section.tsx", import.meta.url),
	"utf8",
);

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

describe("mobile resume rail snapping", () => {
	test("settles a Continue swipe at the start of a complete card", () => {
		expect(continueSectionSource).toContain('layout="resume"');
		expect(scrollSectionSource).toContain("grid snap-x snap-mandatory");
		expect(scrollSectionSource).toContain("md:snap-proximity");
		expect(scrollSectionSource).toContain("[&>*]:snap-start");
	});
});
