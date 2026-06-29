import type { BookComplete } from "../../routers/books/book.model";

// Series search types
export interface SearchSeriesRequest {
	query: string;
	serverId?: string;
	limit?: number;
	offset?: number;
}

export interface SearchSeriesHit {
	id: number;
	name: string;
	bookCount: number;
	cover: string | null;
	/** Most frequent author across the series' books; undefined for ES-backed search. */
	author?: { id: number; name: string } | null;
}

export interface SearchSeriesResponse {
	series: SearchSeriesHit[];
}

// Author search types
export interface SearchAuthorsRequest {
	query: string;
	serverId?: string;
	limit?: number;
}

export interface SearchAuthorHit {
	id: number;
	name: string;
	bookCount: number;
}

export interface SearchAuthorsResponse {
	authors: SearchAuthorHit[];
}

/**
 * Book search request.
 *
 * Supports two pagination strategies:
 * - `cursor` — opaque token returned in the previous response. Ideal for
 *   sequential navigation (infinite scroll, OPDS "next" links). Each provider
 *   encodes its own format (ES uses `search_after` sort values, PGroonga uses
 *   a base64-encoded offset).
 * - `offset` — numeric row offset for direct page access (e.g. `?page=3`
 *   with a known page size). Useful when the client can jump to an arbitrary
 *   page without having visited previous ones (paginated UIs, OPDS catalogs).
 *
 * When both are provided, `offset` takes precedence.
 */
export interface SearchBooksRequest {
	query?: string;
	exactMatch?: boolean;
	filters?: SearchFilters;
	sort?: SearchSort;
	cursor?: string;
	offset?: number;
	limit?: number;
	serverId?: string;
	/** Libraries the caller may view; "ALL" (or undefined) means no restriction. */
	accessibleLibraryIds?: number[] | "ALL";
}

export interface SearchFilters {
	languageCode?: string[];
	publishedDateRange?: { from?: string; to?: string };
	pageCountRange?: { min?: number; max?: number };
	authors?: string[];
	authorIds?: number[];
	series?: string[];
	publishers?: string[];
	/** Minimum Amazon star rating (e.g. 4 = "4+ stars"). */
	minRating?: number;
}

// ── Audiobook search types ──

export interface SearchAudiobooksRequest {
	query?: string;
	exactMatch?: boolean;
	filters?: SearchAudiobookFilters;
	sort?: SearchSort;
	cursor?: string;
	offset?: number;
	limit?: number;
	serverId?: string;
	/** Libraries the caller may view; "ALL" (or undefined) means no restriction. */
	accessibleLibraryIds?: number[] | "ALL";
}

export interface SearchAudiobookFilters {
	languageCode?: string[];
	publishedDateRange?: { from?: string; to?: string };
	authors?: string[];
	authorIds?: number[];
	narrators?: string[];
	narratorIds?: number[];
	series?: string[];
}

export interface SearchAudiobookHit {
	id: number;
	filename: string;
	uuid: string;
	title: string | null;
	subtitle: string | null;
	description: string | null;
	cover: string | null;
	mainColor: string | null;
	duration: number | null;
	authors: { id: number; name: string; role?: string | null }[];
	narrators: { id: number; name: string }[];
	publisher: { name: string } | null;
	series: { name: string } | null;
	createdAt: string;
	lastModified: string | null;
	highlight?: {
		title?: string;
		description?: string;
	};
}

export interface SearchAudiobooksResponse {
	audiobooks: SearchAudiobookHit[];
	pagination: {
		cursor?: string;
		hasMore: boolean;
		totalHits: number;
		totalHitsRelation: "eq" | "gte";
	};
}

export type SearchSort =
	| "relevance"
	| "newest"
	| "oldest"
	| "title_asc"
	| "title_desc"
	| "rating_desc";

export interface SearchBooksResponse {
	books: SearchBookHit[];
	pagination: {
		cursor?: string;
		hasMore: boolean;
		totalHits: number;
		totalHitsRelation: "eq" | "gte";
	};
}

export interface SearchBookHit extends BookComplete {
	highlight?: {
		title?: string;
		description?: string;
		authorName?: string;
	};
}
