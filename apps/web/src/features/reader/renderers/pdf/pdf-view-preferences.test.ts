import "@/test-utils/setup-dom";

import { beforeEach, describe, expect, test } from "bun:test";
import { READER_STORAGE_KEYS } from "@/features/reader/presentation/reader-storage";
import {
	DEFAULT_PDF_VIEW,
	loadPdfViewPreference,
	normalizePdfViewPreference,
	savePdfViewPreference,
} from "./pdf-view-preferences";

beforeEach(() => window.localStorage.clear());

describe("PDF view preferences", () => {
	test("a book reopens with the layout, zoom, rotation and page colours it was left with", () => {
		const view = {
			layout: "spread-odd",
			scrollDirection: "horizontal",
			zoom: 1.5,
			rotation: 1,
			pageTone: "theme",
		} as const;
		savePdfViewPreference("odyssey", view);

		expect(loadPdfViewPreference("odyssey")).toEqual(view);
		expect(loadPdfViewPreference("iliad")).toEqual(DEFAULT_PDF_VIEW);
	});

	test("corrupt or outdated entries fall back field by field", () => {
		expect(
			normalizePdfViewPreference({
				layout: "triple",
				zoom: 99,
				rotation: 7,
				pageTone: "theme",
			}),
		).toEqual({ ...DEFAULT_PDF_VIEW, zoom: 4, pageTone: "theme" });
		expect(normalizePdfViewPreference("nonsense")).toEqual(DEFAULT_PDF_VIEW);
	});

	test("only the most recently read books are kept", () => {
		for (let index = 0; index < 205; index++) {
			savePdfViewPreference(`book-${index}`, DEFAULT_PDF_VIEW);
		}
		savePdfViewPreference("book-0", { ...DEFAULT_PDF_VIEW, zoom: 2 });

		const stored = JSON.parse(
			window.localStorage.getItem(READER_STORAGE_KEYS.pdfViews) ?? "{}",
		);
		expect(Object.keys(stored)).toHaveLength(200);
		expect(stored["book-0"].zoom).toBe(2);
		expect(stored["book-5"]).toBeUndefined();
	});
});
