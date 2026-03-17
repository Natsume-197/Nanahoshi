import type { SearchProvider } from "../search.provider";
import type {
	SearchAuthorsRequest,
	SearchAuthorsResponse,
	SearchBooksRequest,
	SearchBooksResponse,
	SearchSeriesRequest,
	SearchSeriesResponse,
} from "../search.types";
import {
	deleteAuthor,
	deleteAuthorsByQuery,
	deleteBook,
	deleteByQuery,
	deleteSeries,
	deleteSeriesByQuery,
	ensureIndex,
	esClient,
	INDEX_NAME,
	indexAuthor,
	indexAuthorsBulk,
	indexBook,
	indexBooksBulk,
	indexSeries,
	indexSeriesBulk,
	searchAuthors,
	searchBooks,
	searchSeries,
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

	// Series
	async searchSeries(
		request: SearchSeriesRequest,
	): Promise<SearchSeriesResponse> {
		return searchSeries(request);
	}

	async indexSeries(series: Record<string, unknown>): Promise<void> {
		await indexSeries(series);
	}

	async indexSeriesBulk(
		series: Record<string, unknown>[],
	): Promise<{ indexed: number; errors: number }> {
		return indexSeriesBulk(series);
	}

	async deleteSeries(id: string): Promise<void> {
		await deleteSeries(id);
	}

	async deleteSeriesByQuery(query: Record<string, unknown>): Promise<number> {
		return deleteSeriesByQuery(query);
	}

	// Authors
	async searchAuthors(
		request: SearchAuthorsRequest,
	): Promise<SearchAuthorsResponse> {
		return searchAuthors(request);
	}

	async indexAuthor(author: Record<string, unknown>): Promise<void> {
		await indexAuthor(author);
	}

	async indexAuthorsBulk(
		authors: Record<string, unknown>[],
	): Promise<{ indexed: number; errors: number }> {
		return indexAuthorsBulk(authors);
	}

	async deleteAuthor(id: string): Promise<void> {
		await deleteAuthor(id);
	}

	async deleteAuthorsByQuery(query: Record<string, unknown>): Promise<number> {
		return deleteAuthorsByQuery(query);
	}
}
