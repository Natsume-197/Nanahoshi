import type { BookComplete } from "../../routers/books/book.model";

// Series search types
export interface SearchSeriesRequest {
	query: string;
	organizationId?: string;
	limit?: number;
}

export interface SearchSeriesHit {
	id: number;
	name: string;
	bookCount: number;
	cover: string | null;
}

export interface SearchSeriesResponse {
	series: SearchSeriesHit[];
}

// Author search types
export interface SearchAuthorsRequest {
	query: string;
	organizationId?: string;
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
	organizationId?: string;
}

export interface SearchFilters {
	languageCode?: string[];
	publishedDateRange?: { from?: string; to?: string };
	pageCountRange?: { min?: number; max?: number };
	authors?: string[];
	authorIds?: number[];
	series?: string[];
	publishers?: string[];
}

export type SearchSort =
	| "relevance"
	| "newest"
	| "oldest"
	| "title_asc"
	| "title_desc";

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
