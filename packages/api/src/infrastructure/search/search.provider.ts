import type {
	SearchAuthorsRequest,
	SearchAuthorsResponse,
	SearchBooksRequest,
	SearchBooksResponse,
	SearchSeriesRequest,
	SearchSeriesResponse,
} from "./search.types";

export interface SearchProvider {
	initialize(): Promise<void>;
	indexBook(book: Record<string, unknown>): Promise<void>;
	indexBooksBulk(
		books: Record<string, unknown>[],
	): Promise<{ indexed: number; errors: number }>;
	deleteBook(id: string): Promise<void>;
	deleteByQuery(query: Record<string, unknown>): Promise<number>;
	searchBooks(request: SearchBooksRequest): Promise<SearchBooksResponse>;
	getIndexedCount(): Promise<number>;
	requiresSync(): boolean;

	// Series
	searchSeries(request: SearchSeriesRequest): Promise<SearchSeriesResponse>;
	indexSeries(series: Record<string, unknown>): Promise<void>;
	indexSeriesBulk(
		series: Record<string, unknown>[],
	): Promise<{ indexed: number; errors: number }>;
	deleteSeries(id: string): Promise<void>;
	deleteSeriesByQuery(query: Record<string, unknown>): Promise<number>;

	// Authors
	searchAuthors(request: SearchAuthorsRequest): Promise<SearchAuthorsResponse>;
	indexAuthor(author: Record<string, unknown>): Promise<void>;
	indexAuthorsBulk(
		authors: Record<string, unknown>[],
	): Promise<{ indexed: number; errors: number }>;
	deleteAuthor(id: string): Promise<void>;
	deleteAuthorsByQuery(query: Record<string, unknown>): Promise<number>;
}
