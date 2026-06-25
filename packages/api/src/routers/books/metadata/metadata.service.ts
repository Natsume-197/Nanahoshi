import { coverColorQueue } from "../../../infrastructure/queue/queues/cover-color.queue";
import {
	enqueueAuthorSync,
	enqueueSearchSync,
	enqueueSeriesSync,
} from "../../../infrastructure/search/search-sync.service";
import type { BookMetadata } from "./book.metadata.model";
import { bookMetadataRepository } from "./metadata.repository";
import { amazonProvider } from "./providers/amazon.provider";
import type { IMetadataProvider } from "./providers/IMetadata.provider";
import { localProvider } from "./providers/local.provider";
import { ranobedbProvider } from "./providers/ranobedb.provider";

type SaveOptions = {
	providerTag?: "LOCAL" | "AMAZON" | "RANOBEDB";
};

export type MetadataProviderName = "ranobedb" | "amazon";

export const DEFAULT_PROVIDER_ORDER: MetadataProviderName[] = [
	"ranobedb",
	"amazon",
];

const PROVIDERS: Record<MetadataProviderName, IMetadataProvider> = {
	ranobedb: ranobedbProvider,
	amazon: amazonProvider,
};

const PROVIDER_TAGS: Record<MetadataProviderName, "AMAZON" | "RANOBEDB"> = {
	ranobedb: "RANOBEDB",
	amazon: "AMAZON",
};

// Fields each provider can contribute. A provider is skipped when every
// field it could fill is already present ("completar faltantes" semantics).
const PROVIDER_FIELDS: Record<MetadataProviderName, (keyof BookMetadata)[]> = {
	ranobedb: [
		"titleRomaji",
		"description",
		"publishedDate",
		"pageCount",
		"isbn13",
		"asin",
		"authors",
		"publisher",
		"series",
		"genres",
	],
	amazon: [
		"description",
		"publishedDate",
		"pageCount",
		"asin",
		"cover",
		"authors",
		"publisher",
		"series",
		"genres",
		"amazonRating",
		"amazonReviewCount",
	],
};

export class BookMetadataService {
	/**
	 * Enrich and save metadata using only the local (EPUB) provider.
	 * Stores the raw local metadata as the original snapshot.
	 * Amazon enrichment is handled asynchronously via the metadata-enrich queue.
	 */
	async enrichAndSaveMetadata(
		input: Partial<BookMetadata> & {
			bookId: number;
			uuid: string;
			filePath?: string;
		},
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
	 * Enrich metadata running external providers in the library's priority
	 * order. Each provider is only consulted for fields still missing; the
	 * accumulated asin flows to later providers (Amazon skips its search).
	 */
	async enrichFromProviders(
		input: Partial<BookMetadata> & { bookId: number; uuid: string },
		order?: MetadataProviderName[],
	) {
		const providerOrder = await this.resolveProviderOrder(input.bookId, order);

		let acc = { ...input };
		let authorsProvider: MetadataProviderName | null = null;
		let anyResult = false;

		for (const name of providerOrder) {
			const fields = PROVIDER_FIELDS[name];
			const missing = fields.some((field) => this.isFieldMissing(acc[field]));
			if (!missing) continue;

			const result = await PROVIDERS[name].getMetadata(acc);
			if (Object.keys(result).length === 0) continue;

			anyResult = true;
			// Authors from the first provider that returns them win; later
			// providers only fill in when none were found yet.
			const authorsOverride = authorsProvider === null;
			acc = {
				...this.mergeMetadata(acc, result, { authorsOverride }),
				bookId: input.bookId,
				uuid: input.uuid,
			};
			if (authorsOverride && result.authors && result.authors.length > 0) {
				authorsProvider = name;
			}
		}

		if (!anyResult) {
			// Mark as enriched even with no results, to avoid retrying
			await bookMetadataRepository.markAmazonEnriched(input.bookId);
			return null;
		}

		const saved = await this.saveMetadata(acc, input.bookId, {
			providerTag: authorsProvider ? PROVIDER_TAGS[authorsProvider] : "LOCAL",
		});
		// amazonEnrichedAt doubles as a generic "external enrichment ran" flag
		await bookMetadataRepository.markAmazonEnriched(input.bookId);
		return saved;
	}

	/**
	 * Backwards-compatible alias used by the worker and the manual
	 * enrichment endpoint — now runs the full provider chain.
	 */
	async enrichFromAmazon(
		input: Partial<BookMetadata> & { bookId: number; uuid: string },
	) {
		return this.enrichFromProviders(input);
	}

	private async resolveProviderOrder(
		bookId: number,
		order?: MetadataProviderName[],
	): Promise<MetadataProviderName[]> {
		if (order) return order.filter((name) => name in PROVIDERS);

		const fromLibrary = await bookMetadataRepository
			.getLibraryProviderOrder(bookId)
			.catch(() => null);
		if (fromLibrary && fromLibrary.length > 0) {
			const valid = fromLibrary.filter(
				(name): name is MetadataProviderName => name in PROVIDERS,
			);
			if (valid.length > 0) return valid;
		}
		return DEFAULT_PROVIDER_ORDER;
	}

	private isFieldMissing(value: unknown): boolean {
		if (value === undefined || value === null || value === "") return true;
		if (Array.isArray(value)) return value.length === 0;
		return false;
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
		// Catalog entities (publisher/series/author/genre) are scoped per-server;
		// resolve the book's owning server once. Library-less books (no server)
		// skip entity upserts but still get scalar metadata saved.
		const serverId = await bookMetadataRepository.getServerIdByBookId(bookId);

		// ── 1. Publisher ────────────────────────────────────────────
		let publisherId: number | undefined;
		const publisherName =
			typeof metadata.publisher === "string"
				? metadata.publisher
				: metadata.publisher?.name;
		if (publisherName && serverId) {
			publisherId = await bookMetadataRepository.upsertPublisher(
				publisherName,
				serverId,
			);
		}

		// ── 2. Series ───────────────────────────────────────────────
		let seriesId: number | undefined;
		const replacedSeriesIds: number[] = [];
		if (metadata.series?.name && serverId) {
			const previousSeriesIds =
				await bookMetadataRepository.getBookSeriesIds(bookId);
			seriesId = await bookMetadataRepository.upsertSeries(
				metadata.series.name,
				serverId,
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
		};

		let saved = null;
		if (Object.keys(toSave).length) {
			saved = await bookMetadataRepository.upsertMetadata(bookId, toSave);
		}

		// ── 4. Authors ──────────────────────────────────────────────
		let authorIds: number[] = [];
		const replacedAuthorIds: number[] = [];
		if (metadata.authors && metadata.authors.length > 0 && serverId) {
			const providerTag = options?.providerTag ?? "LOCAL";
			const { authorIds: ids, removedAuthorIds } =
				await bookMetadataRepository.replaceBookAuthors(
					bookId,
					metadata.authors,
					providerTag,
					serverId,
				);
			authorIds = ids;
			replacedAuthorIds.push(...removedAuthorIds);
			if (replacedAuthorIds.length > 0) {
				await bookMetadataRepository.deleteAuthorsIfOrphaned(replacedAuthorIds);
			}
		}

		// ── 5. Genres ───────────────────────────────────────────────
		if (metadata.genres && metadata.genres.length > 0 && serverId) {
			await bookMetadataRepository.upsertGenresAndLink(
				bookId,
				metadata.genres,
				serverId,
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
	 * With authorsOverride (default), provider authors replace existing ones
	 * (better identification); otherwise they only fill in when absent.
	 */
	private mergeMetadata(
		base: Partial<BookMetadata>,
		extra: Partial<BookMetadata>,
		options?: { authorsOverride?: boolean },
	): Partial<BookMetadata> {
		const authorsOverride = options?.authorsOverride ?? true;
		const result = { ...base };
		for (const key of Object.keys(extra) as (keyof BookMetadata)[]) {
			if (key === "authors") {
				if (!extra.authors || extra.authors.length === 0) continue;
				if (authorsOverride || !result.authors?.length) {
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
