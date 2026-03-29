import type { SearchProvider } from "../search.provider";
import type {
	SearchAudiobooksRequest,
	SearchAudiobooksResponse,
	SearchAuthorsRequest,
	SearchAuthorsResponse,
	SearchBooksRequest,
	SearchBooksResponse,
	SearchSeriesRequest,
	SearchSeriesResponse,
} from "../search.types";
import {
	deleteAudiobook,
	deleteAudiobooksByQuery,
	deleteAuthor,
	deleteAuthorsByQuery,
	deleteBook,
	deleteByQuery,
	deleteSeries,
	deleteSeriesByQuery,
	ensureIndex,
	esClient,
	INDEX_NAME,
	indexAudiobook,
	indexAudiobooksBulk,
	indexAuthor,
	indexAuthorsBulk,
	indexBook,
	indexBooksBulk,
	indexSeries,
	indexSeriesBulk,
	searchAudiobooks,
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

	// Audiobooks
	async searchAudiobooks(
		request: SearchAudiobooksRequest,
	): Promise<SearchAudiobooksResponse> {
		return searchAudiobooks(request);
	}

	async indexAudiobook(audiobook: Record<string, unknown>): Promise<void> {
		await indexAudiobook(audiobook);
	}

	async indexAudiobooksBulk(
		audiobooks: Record<string, unknown>[],
	): Promise<{ indexed: number; errors: number }> {
		return indexAudiobooksBulk(audiobooks);
	}

	async deleteAudiobook(id: string): Promise<void> {
		await deleteAudiobook(id);
	}

	async deleteAudiobooksByQuery(
		query: Record<string, unknown>,
	): Promise<number> {
		return deleteAudiobooksByQuery(query);
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
