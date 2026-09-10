import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const scrollSectionSource = readFileSync(
	new URL("./scroll-section.tsx", import.meta.url),
	"utf8",
);
const continueSectionSource = readFileSync(
	new URL("../dashboard/home/continue-section.tsx", import.meta.url),
	"utf8",
);

describe("mobile resume rail snapping", () => {
	test("settles a Continue swipe at the start of a complete card", () => {
		expect(continueSectionSource).toContain('layout="resume"');
		expect(scrollSectionSource).toContain("grid snap-x snap-mandatory");
		expect(scrollSectionSource).toContain("md:snap-proximity");
		expect(scrollSectionSource).toContain("[&>*]:snap-start");
	});
});
