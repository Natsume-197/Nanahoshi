import { coverColorQueue } from "../../../infrastructure/queue/queues/cover-color.queue";
import { enqueueSearchSync } from "../../../infrastructure/search/search-sync.service";
import type { Author, BookMetadata } from "./book.metadata.model";
import { bookMetadataRepository } from "./metadata.repository";
import type { IMetadataProvider } from "./providers/IMetadata.provider";
import { amazonProvider } from "./providers/amazon.provider";
import { localProvider } from "./providers/local.provider";

type SaveOptions = {
	providerTag?: "LOCAL" | "AMAZON";
	skipSearchSync?: boolean;
};

export class BookMetadataService {
	private providers: IMetadataProvider[] = [localProvider, amazonProvider];

	/**
	 * Enrich and save metadata using all providers.
	 * Stores the raw local (EPUB) metadata as the original snapshot.
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

		const metadata = await this.getCompleteMetadata(input);
		if (Object.keys(metadata).length === 0) return null;
		return this.saveMetadata(metadata, input.bookId, {
			providerTag: "LOCAL",
		});
	}

	/**
	 * Enrich metadata using only the Amazon provider, then save.
	 * Used for manual per-book enrichment from the UI.
	 * Pass skipSearchSync: true when calling in bulk (reindex at end instead).
	 */
	async enrichFromAmazon(
		input: Partial<BookMetadata> & { bookId: number; uuid: string },
		options?: SaveOptions,
	) {
		const result = await amazonProvider.getMetadata(input);
		if (Object.keys(result).length === 0) return null;

		const metadata = this.mergeMetadata(input, result);
		return this.saveMetadata(metadata, input.bookId, {
			providerTag: "AMAZON",
			...options,
		});
	}

	/**
	 * Restore a book's metadata to its original EPUB snapshot.
	 * Clears all enriched data (authors, genres, series) and re-saves from original.
	 */
	async restoreOriginal(bookId: number) {
		const original = await bookMetadataRepository.getOriginalMetadata(bookId);
		if (!original) return null;

		const data = original as Record<string, unknown>;

		// Clear all existing links
		await Promise.all([
			bookMetadataRepository.clearBookAuthors(bookId),
			bookMetadataRepository.clearBookGenres(bookId),
			bookMetadataRepository.clearBookSeries(bookId),
		]);

		// Reset enriched-only fields on book_metadata
		await bookMetadataRepository.resetMetadata(bookId, {
			asin: null,
			amazonRating: null,
			amazonReviewCount: null,
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
		if (metadata.series?.name) {
			seriesId = await bookMetadataRepository.upsertSeries(
				metadata.series.name,
			);
			await bookMetadataRepository.linkBookSeries(
				bookId,
				seriesId,
				metadata.series.position ?? null,
			);
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
		if (metadata.authors && metadata.authors.length > 0) {
			const providerTag = options?.providerTag ?? "LOCAL";

			// Get existing authors linked to this book
			const existingAuthors =
				await bookMetadataRepository.getBookAuthors(bookId);
			const existingByName = new Map(
				existingAuthors.map((a) => [a.name.toLowerCase(), a]),
			);

			await Promise.all(
				metadata.authors.map(async (a: Author) => {
					const authorId = await bookMetadataRepository.upsertAuthor(
						a.name,
						providerTag,
					);

					const existing = existingByName.get(a.name.toLowerCase());
					if (existing && existing.id !== authorId) {
						// Same name but different author record (e.g. LOCAL → AMAZON upgrade)
						// Replace the old link with the better-identified one
						await bookMetadataRepository.unlinkBookAuthor(
							bookId,
							existing.id,
						);
					}

					await bookMetadataRepository.linkBookAuthor(bookId, authorId, a.role ?? "Author");
				}),
			);
		}

		// ── 5. Genres ───────────────────────────────────────────────
		if (metadata.genres && metadata.genres.length > 0) {
			await Promise.all(
				metadata.genres.map(async (genreName: string) => {
					const genreId =
						await bookMetadataRepository.upsertGenre(genreName);
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
		if (!options?.skipSearchSync) {
			await enqueueSearchSync(bookId, "update");
		}

		return saved;
	}

	/**
	 * Fill in fields using all providers.
	 */
	private async getCompleteMetadata(
		input: Partial<BookMetadata>,
	): Promise<Partial<BookMetadata>> {
		let combined: Partial<BookMetadata> = { ...input };
		for (const provider of this.providers) {
			const result = await provider.getMetadata(combined);
			combined = this.mergeMetadata(combined, result);
		}
		return combined;
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
