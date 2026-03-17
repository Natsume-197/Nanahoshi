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

// Book search types
export interface SearchBooksRequest {
	query?: string;
	exactMatch?: boolean;
	filters?: SearchFilters;
	sort?: SearchSort;
	cursor?: string;
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
