import type { SearchProvider } from "../search.provider";
import type { SearchBooksRequest, SearchBooksResponse } from "../search.types";
import {
	deleteBook,
	deleteByQuery,
	ensureIndex,
	esClient,
	INDEX_NAME,
	indexBook,
	indexBooksBulk,
	searchBooks,
} from "./search.client";

export class ElasticsearchProvider implements SearchProvider {
	async initialize(): Promise<void> {
		await ensureIndex();
	}

	async indexBook(book: Record<string, unknown>): Promise<void> {
		await indexBook(book);
	}

	async indexBooksBulk(
		books: Record<string, unknown>[],
	): Promise<{ indexed: number; errors: number }> {
		return indexBooksBulk(books);
	}

	async deleteBook(id: string): Promise<void> {
		await deleteBook(id);
	}

	async deleteByQuery(query: Record<string, unknown>): Promise<number> {
		return deleteByQuery(query);
	}

	async searchBooks(request: SearchBooksRequest): Promise<SearchBooksResponse> {
		return searchBooks(request);
	}

	async getIndexedCount(): Promise<number> {
		const result = await esClient.count({ index: INDEX_NAME });
		return result.count;
	}

	requiresSync(): boolean {
		return true;
	}
}
