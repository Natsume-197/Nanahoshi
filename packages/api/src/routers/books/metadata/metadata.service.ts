import { coverColorQueue } from "../../../infrastructure/queue/queues/cover-color.queue";
import {
	enqueueAuthorSync,
	enqueueSearchSync,
	enqueueSeriesSync,
} from "../../../infrastructure/search/search-sync.service";
import type { Author, BookMetadata } from "./book.metadata.model";
import { bookMetadataRepository } from "./metadata.repository";
import { amazonProvider } from "./providers/amazon.provider";
import { localProvider } from "./providers/local.provider";

type SaveOptions = {
	providerTag?: "LOCAL" | "AMAZON";
};

export class BookMetadataService {
	/**
	 * Enrich and save metadata using only the local (EPUB) provider.
	 * Stores the raw local metadata as the original snapshot.
	 * Amazon enrichment is handled asynchronously via the metadata-enrich queue.
	 */
	async enrichAndSaveMetadata(
		input: Partial<BookMetadata> & { bookId: number; uuid: string },
	) {
		// Extract local metadata first and store as original
		const localMetadata = await localProvider.getMetadata(input);
		if (Object.keys(localMetadata).length > 0) {
			await bookMetadataRepository.saveOriginalMetadata(
				input.bookId,
				localMetadata,
			);
		}

		const metadata = this.mergeMetadata(input, localMetadata);
		if (Object.keys(metadata).length === 0) return null;
		return this.saveMetadata(metadata, input.bookId, {
			providerTag: "LOCAL",
		});
	}

	/**
	 * Enrich metadata using only the Amazon provider, then save.
	 * Used for manual per-book enrichment from the UI.
	 */
	async enrichFromAmazon(
		input: Partial<BookMetadata> & { bookId: number; uuid: string },
	) {
		const result = await amazonProvider.getMetadata(input);
		if (Object.keys(result).length === 0) {
			// Mark as enriched even if Amazon returned nothing, to avoid retrying
			await bookMetadataRepository.markAmazonEnriched(input.bookId);
			return null;
		}

		const metadata = this.mergeMetadata(input, result);
		const saved = await this.saveMetadata(metadata, input.bookId, {
			providerTag: "AMAZON",
		});
		await bookMetadataRepository.markAmazonEnriched(input.bookId);
		return saved;
	}

	/**
	 * Restore a book's metadata to its original EPUB snapshot.
	 * Clears all enriched data (authors, genres, series) and re-saves from original.
	 */
	async restoreOriginal(bookId: number) {
		const original = await bookMetadataRepository.getOriginalMetadata(bookId);
		if (!original) return null;

		const data = original as Record<string, unknown>;

		// Capture current links before clearing so we can clean up orphans
		const [previousAuthors, previousSeriesIds] = await Promise.all([
			bookMetadataRepository.getBookAuthors(bookId),
			bookMetadataRepository.getBookSeriesIds(bookId),
		]);

		// Clear all existing links
		await Promise.all([
			bookMetadataRepository.clearBookAuthors(bookId),
			bookMetadataRepository.clearBookGenres(bookId),
			bookMetadataRepository.clearBookSeries(bookId),
		]);

		// Delete orphaned authors and series, then sync ES
		await Promise.all([
			...previousAuthors.map((a) =>
				bookMetadataRepository.deleteAuthorIfOrphaned(a.id),
			),
			...previousSeriesIds.map((id) =>
				bookMetadataRepository.deleteSeriesIfOrphaned(id),
			),
		]);
		await Promise.all([
			...previousAuthors.map((a) => enqueueAuthorSync(a.id)),
			...previousSeriesIds.map((id) => enqueueSeriesSync(id)),
		]);

		// Reset enriched-only fields on book_metadata
		await bookMetadataRepository.resetMetadata(bookId, {
			asin: null,
			amazonRating: null,
			amazonReviewCount: null,
			amazonEnrichedAt: null,
			isbn10: null,
			isbn13: null,
			seriesId: null,
			description: null,
		});

		// Re-save from original using the normal save flow
		const metadata = data as Partial<BookMetadata>;
		return this.saveMetadata(metadata, bookId, {
			providerTag: "LOCAL",
		});
	}

	/**
	 * Core save logic shared by enrichAndSaveMetadata and enrichFromAmazon.
	 */
	private async saveMetadata(
		metadata: Partial<BookMetadata>,
		bookId: number,
		options?: SaveOptions,
	) {
		// ── 1. Publisher ────────────────────────────────────────────
		let publisherId: number | undefined;
		const publisherName =
			typeof metadata.publisher === "string"
				? metadata.publisher
				: metadata.publisher?.name;
		if (publisherName) {
			publisherId = await bookMetadataRepository.upsertPublisher(publisherName);
		}

		// ── 2. Series ───────────────────────────────────────────────
		let seriesId: number | undefined;
		const replacedSeriesIds: number[] = [];
		const previousSeriesIds =
			await bookMetadataRepository.getBookSeriesIds(bookId);
		if (metadata.series?.name) {
			seriesId = await bookMetadataRepository.upsertSeries(
				metadata.series.name,
			);
			// Remove old series links if series changed
			const oldSeriesIds = previousSeriesIds.filter((id) => id !== seriesId);
			if (oldSeriesIds.length > 0) {
				await bookMetadataRepository.clearBookSeries(bookId);
				replacedSeriesIds.push(...oldSeriesIds);
			}
			await bookMetadataRepository.linkBookSeries(
				bookId,
				seriesId,
				metadata.series.position ?? null,
			);
			// Delete orphaned old series
			for (const oldId of oldSeriesIds) {
				await bookMetadataRepository.deleteSeriesIfOrphaned(oldId);
			}
		}

		// ── 3. Prepare base payload (without loose strings) ─────────
		const {
			publisher: _publisher,
			authors: _authors,
			series: _series,
			genres: _genres,
			bookId: _bookId,
			uuid: _uuid,
			...metadataFields
		} = metadata as Record<string, unknown>;
		const toSave: Record<string, unknown> = {
			...metadataFields,
			publisherId,
			...(seriesId ? { seriesId } : {}),
		};

		let saved = null;
		if (Object.keys(toSave).length) {
			saved = await bookMetadataRepository.upsertMetadata(bookId, toSave);
		}

		// ── 4. Authors ──────────────────────────────────────────────
		let authorIds: number[] = [];
		const replacedAuthorIds: number[] = [];
		if (metadata.authors && metadata.authors.length > 0) {
			const providerTag = options?.providerTag ?? "LOCAL";

			// Clear all existing author links and replace with the new set
			const previousAuthors =
				await bookMetadataRepository.getBookAuthors(bookId);
			if (previousAuthors.length > 0) {
				await bookMetadataRepository.clearBookAuthors(bookId);
			}

			authorIds = await Promise.all(
				metadata.authors.map(async (a: Author) => {
					const authorId = await bookMetadataRepository.upsertAuthor(
						a.name,
						providerTag,
					);
					await bookMetadataRepository.linkBookAuthor(
						bookId,
						authorId,
						a.role ?? "Author",
					);
					return authorId;
				}),
			);

			// Clean up orphaned previous authors
			const newAuthorIdSet = new Set(authorIds);
			for (const prev of previousAuthors) {
				if (!newAuthorIdSet.has(prev.id)) {
					await bookMetadataRepository.deleteAuthorIfOrphaned(prev.id);
					replacedAuthorIds.push(prev.id);
				}
			}
		}

		// ── 5. Genres ───────────────────────────────────────────────
		if (metadata.genres && metadata.genres.length > 0) {
			await Promise.all(
				metadata.genres.map(async (genreName: string) => {
					const genreId = await bookMetadataRepository.upsertGenre(genreName);
					await bookMetadataRepository.linkBookGenre(bookId, genreId);
				}),
			);
		}

		// ── 6. Enqueue cover color extraction (non-blocking) ────────
		if (metadata.cover) {
			await coverColorQueue.add(
				"extract",
				{
					bookId: Number(bookId),
					coverPath: metadata.cover,
				},
				{ removeOnComplete: true, removeOnFail: 100 },
			);
		}

		// ── 7. Sync search index (Elasticsearch) ────────────────────
		await Promise.all([
			enqueueSearchSync(bookId, "update"),
			seriesId ? enqueueSeriesSync(seriesId) : undefined,
			...authorIds.map((id) => enqueueAuthorSync(id)),
			// Sync replaced entities so ES reflects deletions/updates
			...replacedSeriesIds.map((id) => enqueueSeriesSync(id)),
			...replacedAuthorIds.map((id) => enqueueAuthorSync(id)),
		]);

		return saved;
	}

	/**
	 * Merge metadata, giving priority to existing values.
	 */
	private mergeMetadata(
		base: Partial<BookMetadata>,
		extra: Partial<BookMetadata>,
	): Partial<BookMetadata> {
		const result = { ...base };
		for (const key of Object.keys(extra) as (keyof BookMetadata)[]) {
			if (key === "authors") {
				// Amazon authors take priority (better identification via ASIN)
				if (extra.authors && extra.authors.length > 0) {
					result.authors = extra.authors;
				}
				continue;
			}
			if (
				result[key] === undefined ||
				result[key] === null ||
				result[key] === ""
			) {
				(result as Record<string, unknown>)[key] = extra[key];
			}
		}
		return result;
	}
}

export const bookMetadataService = new BookMetadataService();
