import type { SearchBooksRequest, SearchBooksResponse } from "./search.types";

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
}
