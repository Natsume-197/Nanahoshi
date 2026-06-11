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

/** Parsed book content, cached in IndexedDB keyed by the Nanahoshi book uuid. */
export interface ReaderBookData {
	uuid: string;
	title: string;
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
