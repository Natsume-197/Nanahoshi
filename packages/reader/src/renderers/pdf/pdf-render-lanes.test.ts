import { describe, expect, test } from "bun:test";
import {
	extraPdfRenderLaneCount,
	MAX_PAGE_RENDER_PIXELS,
	pdfPageRenderScale,
} from "./pdf-render-lanes";

const odysseyPage = { width: 745.68, height: 1149.1 };

describe("pdfPageRenderScale", () => {
	test("renders at the on-screen size times the pixel ratio", () => {
		expect(pdfPageRenderScale(odysseyPage, 0.687, 2)).toBe(1.374);
	});

	test("a zoomed-in page stops at the pixel cap and leaves detail to tiles", () => {
		const scale = pdfPageRenderScale(odysseyPage, 4, 2);
		const pixels = odysseyPage.width * scale * odysseyPage.height * scale;

		expect(scale).toBeLessThan(8);
		expect(pixels).toBeLessThanOrEqual(MAX_PAGE_RENDER_PIXELS * 1.001);
	});
});

describe("extraPdfRenderLaneCount", () => {
	test("a desktop with cores and memory to spare renders on three workers", () => {
		expect(extraPdfRenderLaneCount({ cores: 8, memoryGb: 8 })).toBe(2);
	});

	test("a mid-range phone gets one extra worker", () => {
		expect(extraPdfRenderLaneCount({ cores: 8, memoryGb: 4 })).toBe(1);
	});

	test("low memory or few cores keep the single engine", () => {
		expect(extraPdfRenderLaneCount({ cores: 8, memoryGb: 2 })).toBe(0);
		expect(extraPdfRenderLaneCount({ cores: 2, memoryGb: 8 })).toBe(0);
	});
});
