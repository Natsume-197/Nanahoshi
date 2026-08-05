import type { EbookPresentation } from "@nanahoshi-v2/ebook-parser";
import type { SupportedEbookFormat } from "@nanahoshi-v2/ebook-parser/formats";

/**
 * Shared reader types. The `Section` shape is ported from the ttu ebook
 * reader (BSD-3-Clause, ッツ Reader Authors).
 */

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

/**
 * Version of the counting algorithm behind `characters`/`sections`. Cached
 * entries with an older (or missing) version are recounted from their stored
 * HTML on load — the original EPUB is not kept, so a full re-parse is not an
 * option offline. Bump when getCharacterCount/getParagraphNodes change.
 */
export const BOOK_COUNT_VERSION = 2;

/** Version of Content Form inference for cached ReaderBookData. */
export const BOOK_CONTENT_FORM_VERSION = 1;

/**
 * Version of the sanitizer profile the cached `elementHtml` was cleaned with.
 * Book HTML is sanitized once, before it is stored, so opening a cached book
 * skips DOMPurify entirely — it dominated the open path otherwise. Entries with
 * an older (or missing) version are sanitized on read instead, so tightening
 * the profile only needs a bump here to invalidate previously-cleaned HTML.
 */
export const BOOK_SANITIZE_VERSION = 1;

export const SECTION_REFERENCE_PREFIX = "ttu-";

/** Parsed book content, cached in IndexedDB keyed by the Nanahoshi book uuid. */
export type ReaderSourceFormat = SupportedEbookFormat;

export interface ReaderBookData {
	uuid: string;
	sourceFormat?: ReaderSourceFormat;
	/** File-derived delivery form used to resolve the automatic presentation. */
	contentForm?: "text" | "images";
	/** Missing on legacy cache entries, which are reclassified from stored HTML. */
	contentFormVersion?: number;
	presentation?: EbookPresentation;
	serverId?: string | null;
	title: string;
	cover?: string | null;
	language: string;
	elementHtml: string;
	styleSheet: string;
	blobs: Record<string, Blob>;
	characters: number;
	sections: Section[];
	storedAt: number;
	countVersion?: number;
	/** See BOOK_SANITIZE_VERSION. Absent on entries cached before write-time
	 *  sanitizing, which are sanitized on read. */
	sanitizeVersion?: number;
}

/** Last reading position, persisted locally (and as char count on the server). */
export interface ReaderBookmark {
	exploredCharCount: number;
	progress: number;
	scrollX?: number;
	scrollY?: number;
	lastBookmarkModified: number;
}
