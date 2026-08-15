import type { EbookPresentation } from "@nanahoshi-v2/ebook-parser";

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
