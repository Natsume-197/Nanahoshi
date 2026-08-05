import type { EbookPresentation } from "@nanahoshi-v2/ebook-parser";
import { BOOK_CONTENT_FORM_VERSION, type ReaderBookData } from "./types";

interface ContentFormEvidence {
	presentation?: EbookPresentation;
	sectionCount: number;
	textLength: number;
	imageCount: number;
}

/** Classifies HTML reader data from package declarations and measured content. */
export function classifyContentForm({
	presentation,
	sectionCount,
	textLength,
	imageCount,
}: ContentFormEvidence): "text" | "images" {
	const declaredImages =
		presentation?.layout?.trim().toLowerCase() === "pre-paginated" &&
		(presentation.spread?.trim().toLowerCase() === "landscape" ||
			presentation.declaresPageResolution === true);
	const measuredImages =
		sectionCount > 0 &&
		textLength / sectionCount < 100 &&
		imageCount / sectionCount >= 0.9;

	return declaredImages || measuredImages ? "images" : "text";
}

/**
 * Backfills Content Form for IndexedDB entries written before classification
 * was versioned. Stored HTML is sufficient, so migration remains offline.
 */
export function upgradeCachedContentForm(
	data: ReaderBookData,
	document: Document,
): ReaderBookData {
	if (data.contentFormVersion === BOOK_CONTENT_FORM_VERSION) return data;

	const container = document.createElement("div");
	container.innerHTML = data.elementHtml;
	const children = Array.from(container.children);
	const textLength = children.reduce(
		(total, child) =>
			total + (child.textContent?.replace(/\s+/gu, "").length ?? 0),
		0,
	);
	const imageCount = children.reduce(
		(total, child) => total + child.querySelectorAll("img, svg image").length,
		0,
	);

	return {
		...data,
		contentForm: classifyContentForm({
			presentation: data.presentation,
			sectionCount: Math.max(children.length, data.sections.length),
			textLength,
			imageCount,
		}),
		contentFormVersion: BOOK_CONTENT_FORM_VERSION,
	};
}
