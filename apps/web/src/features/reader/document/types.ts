import type { EbookPresentation } from "@nanahoshi-v2/ebook-parser";
import type { SupportedEbookFormat } from "@nanahoshi-v2/ebook-parser/formats";

export interface Section {
	reference: string;
	charactersWeight: number;
	label?: string;
	startCharacter?: number;
	characters?: number;
	parentChapter?: string;
}

/** A section plus how far the reader has scrolled through it (0–100). */
export type SectionWithProgress = Section & { progress: number };

/** Version of the persisted explored-character coordinate system. */
export const READER_POSITION_VERSION = 3;

/**
 * Version of the sanitizer profile used while parsing the current book.
 * It avoids sanitizing the same HTML twice before the reader renders it.
 */
export const BOOK_SANITIZE_VERSION = 1;

export const SECTION_REFERENCE_PREFIX = "nanahoshi-";

/** Source format of parsed book content. */
export type ReaderSourceFormat = SupportedEbookFormat;

export interface ReaderBookData {
	uuid: string;
	sourceFormat?: ReaderSourceFormat;
	/** File-derived delivery form used to resolve the automatic presentation. */
	contentForm?: "text" | "images";
	presentation?: EbookPresentation;
	title: string;
	cover?: string | null;
	language: string;
	elementHtml: string;
	styleSheet: string;
	blobs: Record<string, Blob>;
	characters: number;
	sections: Section[];
	/** Exact own counts per spine section, before folding children into chapters. */
	sectionCharacterCounts?: number[];
	/** See BOOK_SANITIZE_VERSION. */
	sanitizeVersion?: number;
}

/** Last reading position, persisted locally (and as char count on the server). */
export interface ReaderPosition {
	exploredCharCount: number;
	progress: number;
	positionVersion?: number;
	scrollX?: number;
	scrollY?: number;
	modifiedAt: number;
	/** Stable local coordinate for lazy EPUB sections. The server still syncs
	 * exploredCharCount, so older clients remain compatible. */
	locator?: {
		sectionReference: string;
		characterOffset: number;
	};
}

/** DOM-independent text target used by reader engines and Read & Listen. */
export type ReaderTextAnchor =
	| {
			kind: "fragment";
			sectionReference: string;
			fragmentId: string;
	  }
	| {
			kind: "text-quote";
			sectionReference: string;
			exact: string;
			prefix?: string;
			suffix?: string;
			/** Zero-based occurrence among equal quotes in the same section. */
			occurrence?: number;
	  };
