import type { ReaderPosition } from "@/lib/reader/types";

export type PdfLayoutMode = "page" | "continuous" | "spread";

export function clampPdfPage(pageNumber: number, pageCount: number) {
	return Math.min(Math.max(Math.floor(pageNumber), 1), Math.max(1, pageCount));
}

export function positionForPdfPage(
	pageNumber: number,
	pageCount: number,
): ReaderPosition {
	const page = clampPdfPage(pageNumber, pageCount);
	return {
		exploredCharCount: page,
		progress: page / Math.max(1, pageCount),
		modifiedAt: Date.now(),
	};
}

export function pdfNavigationBehavior(
	currentPage: number,
	targetPage: number,
): "smooth" | "instant" {
	return Math.abs(targetPage - currentPage) <= 1 ? "smooth" : "instant";
}

/**
 * Spreads keep the cover by itself, then pair pages 2–3, 4–5, and so on.
 * This matches a physical book while still accepting a target inside a pair.
 */
export function pdfPagesForLayout(
	pageIndex: number,
	pageCount: number,
	layout: PdfLayoutMode,
) {
	const index = Math.min(
		Math.max(Math.floor(pageIndex), 0),
		Math.max(0, pageCount - 1),
	);
	if (layout !== "spread" || pageCount <= 1 || index === 0) return [index];
	const spreadStart = index - ((index - 1) % 2);
	return [spreadStart, spreadStart + 1].filter(
		(page) => page >= 0 && page < pageCount,
	);
}

export function stepPdfPage(
	pageIndex: number,
	pageCount: number,
	layout: PdfLayoutMode,
	direction: -1 | 1,
) {
	if (layout !== "spread") {
		return Math.min(
			Math.max(pageIndex + direction, 0),
			Math.max(0, pageCount - 1),
		);
	}
	const visible = pdfPagesForLayout(pageIndex, pageCount, layout);
	const target =
		direction > 0
			? (visible.at(-1) ?? pageIndex) + 1
			: (visible[0] ?? pageIndex) <= 1
				? 0
				: (visible[0] ?? pageIndex) - 2;
	return Math.min(Math.max(target, 0), Math.max(0, pageCount - 1));
}
