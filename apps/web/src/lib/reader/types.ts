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

/** Parsed book content, cached in IndexedDB keyed by the Nanahoshi book uuid. */
export interface ReaderBookData {
	uuid: string;
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
}

/** Last reading position, persisted locally (and as char count on the server). */
export interface ReaderBookmark {
	exploredCharCount: number;
	progress: number;
	scrollX?: number;
	scrollY?: number;
	lastBookmarkModified: number;
}
