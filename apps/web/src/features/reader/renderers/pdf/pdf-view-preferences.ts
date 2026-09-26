import { READER_STORAGE_KEYS } from "@/features/reader/presentation/reader-storage";
import type { PdfLayoutMode, PdfScrollDirection } from "./pdf-view-state";

export type PdfPageTone = "original" | "theme";
/** A zoom mode keyword (fit-page, fit-width, automatic) or an absolute scale. */
export type PdfZoomPreference = "fit-page" | "fit-width" | "automatic" | number;

export interface PdfViewPreference {
	layout: PdfLayoutMode;
	scrollDirection: PdfScrollDirection;
	zoom: PdfZoomPreference;
	/** Quarter turns clockwise. */
	rotation: 0 | 1 | 2 | 3;
	pageTone: PdfPageTone;
}

export const DEFAULT_PDF_VIEW: PdfViewPreference = {
	layout: "page",
	scrollDirection: "vertical",
	zoom: "fit-page",
	rotation: 0,
	pageTone: "original",
};

// Oldest books are dropped past this so localStorage stays small.
const MAX_REMEMBERED_BOOKS = 200;

export function normalizePdfViewPreference(value: unknown): PdfViewPreference {
	const stored = (value && typeof value === "object" ? value : {}) as Record<
		string,
		unknown
	>;
	const pick = <T>(candidate: unknown, allowed: readonly T[], fallback: T) =>
		allowed.includes(candidate as T) ? (candidate as T) : fallback;
	const zoom = stored.zoom;
	return {
		layout: pick(
			stored.layout,
			["page", "spread-odd", "spread-even"] as const,
			DEFAULT_PDF_VIEW.layout,
		),
		scrollDirection: pick(
			stored.scrollDirection,
			["vertical", "horizontal"] as const,
			DEFAULT_PDF_VIEW.scrollDirection,
		),
		zoom:
			typeof zoom === "number" && Number.isFinite(zoom)
				? Math.min(Math.max(zoom, 0.25), 4)
				: pick(
						zoom,
						["fit-page", "fit-width", "automatic"] as const,
						DEFAULT_PDF_VIEW.zoom,
					),
		rotation: pick(stored.rotation, [0, 1, 2, 3] as const, 0),
		pageTone: pick(
			stored.pageTone,
			["original", "theme"] as const,
			DEFAULT_PDF_VIEW.pageTone,
		),
	};
}

function readAll(): Record<string, unknown> {
	try {
		const parsed = JSON.parse(
			window.localStorage.getItem(READER_STORAGE_KEYS.pdfViews) ?? "{}",
		) as unknown;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function loadPdfViewPreference(bookUuid: string): PdfViewPreference {
	if (typeof window === "undefined") return DEFAULT_PDF_VIEW;
	return normalizePdfViewPreference(readAll()[bookUuid]);
}

export function savePdfViewPreference(
	bookUuid: string,
	preference: PdfViewPreference,
) {
	if (typeof window === "undefined") return;
	try {
		const stored = readAll();
		// Re-inserting moves the book to the most-recent end.
		delete stored[bookUuid];
		stored[bookUuid] = preference;
		const entries = Object.entries(stored).slice(-MAX_REMEMBERED_BOOKS);
		window.localStorage.setItem(
			READER_STORAGE_KEYS.pdfViews,
			JSON.stringify(Object.fromEntries(entries)),
		);
	} catch {
		// Private storage may reject writes; the view simply isn't remembered.
	}
}
