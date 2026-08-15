import { describe, expect, test } from "bun:test";
import { createPdfSections } from "@/lib/reader/pdf-source";
import {
	pdfNavigationBehavior,
	pdfPagesForLayout,
	positionForPdfPage,
	stepPdfPage,
} from "./pdf-view-state";

describe("PDF view state", () => {
	test("stores clamped, one-based page positions", () => {
		expect(positionForPdfPage(3, 10)).toMatchObject({
			exploredCharCount: 3,
			progress: 0.3,
		});
		expect(positionForPdfPage(0, 10).exploredCharCount).toBe(1);
		expect(positionForPdfPage(99, 10).exploredCharCount).toBe(10);
	});

	test("creates one navigable section per page", () => {
		const sections = createPdfSections(3);
		expect(sections).toHaveLength(3);
		expect(sections[0]).toMatchObject({
			reference: "pdf-page-1",
			startCharacter: 1,
			characters: 1,
		});
		expect(sections[2]).toMatchObject({
			reference: "pdf-page-3",
			startCharacter: 3,
		});
	});

	test("animates adjacent turns but not long-distance jumps", () => {
		expect(pdfNavigationBehavior(4, 5)).toBe("smooth");
		expect(pdfNavigationBehavior(5, 4)).toBe("smooth");
		expect(pdfNavigationBehavior(5, 50)).toBe("instant");
	});

	test("keeps the cover alone and pairs the remaining spread pages", () => {
		expect(pdfPagesForLayout(0, 6, "spread")).toEqual([0]);
		expect(pdfPagesForLayout(1, 6, "spread")).toEqual([1, 2]);
		expect(pdfPagesForLayout(2, 6, "spread")).toEqual([1, 2]);
		expect(pdfPagesForLayout(5, 6, "spread")).toEqual([5]);
		expect(stepPdfPage(0, 6, "spread", 1)).toBe(1);
		expect(stepPdfPage(1, 6, "spread", 1)).toBe(3);
		expect(stepPdfPage(3, 6, "spread", -1)).toBe(1);
	});
});
