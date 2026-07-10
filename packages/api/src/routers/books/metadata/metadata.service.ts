import { TooManyRequestsError } from "../../../errors";
import { coverColorQueue } from "../../../infrastructure/queue/queues/cover-color.queue";
import {
	enqueueAuthorSync,
	enqueueSearchSync,
	enqueueSeriesSync,
} from "../../../infrastructure/search/search-sync.service";
import type { BookMetadata } from "./book.metadata.model";
import { bookMetadataRepository } from "./metadata.repository";
import {
	AmazonTransientError,
	amazonProvider,
} from "./providers/amazon.provider";
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
	// Enrich + save using only the local (EPUB) provider, storing the raw result
	// as the original snapshot. Amazon enrichment runs async via the queue.
	async enrichAndSaveMetadata(
		input: Partial<BookMetadata> & {
			bookId: number;
			uuid: string;
			filePath?: string;
		},
	) {
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

	// Scalar fields the local (EPUB) provider can contribute on a reprocess pass.
	private static readonly LOCAL_FILL_FIELDS = [
		"title",
		"subtitle",
		"description",
		"publishedDate",
		"languageCode",
		"isbn10",
		"isbn13",
		"asin",
		"embeddedUid",
		"amountChars",
		"cover",
	] as const satisfies readonly (keyof BookMetadata)[];

	// Reprocess: re-extract EPUB metadata but only fill fields still empty in the
	// DB — existing values (Amazon/RanobeDB/manual edits) always win, unlike
	// enrichAndSaveMetadata which overwrites with the local extract.
	async fillMissingFromLocal(input: { bookId: number; uuid: string }) {
		const row = await bookMetadataRepository.getEnrichRowByBookId(input.bookId);
		if (!row) return null;

		const local = await localProvider.getMetadata(input);
		if (Object.keys(local).length === 0) return null;

		const fill: Record<string, unknown> = {};
		for (const key of BookMetadataService.LOCAL_FILL_FIELDS) {
			if (this.isFieldMissing(row[key]) && !this.isFieldMissing(local[key])) {
				fill[key] = local[key];
			}
		}

		// Entity links fill independently, and only when the book has none.
		const authors = (row.authors ?? []) as unknown[];
		if (authors.length === 0 && local.authors?.length) {
			fill.authors = local.authors;
		}
		const publisherName = (row.publisher as { name?: string | null } | null)
			?.name;
		if (!publisherName && local.publisher) {
			fill.publisher = local.publisher;
		}

		if (Object.keys(fill).length === 0) return null;
		return this.saveMetadata(fill as Partial<BookMetadata>, input.bookId, {
			providerTag: "LOCAL",
		});
	}

	// Run external providers in the library's priority order, each consulted only
	// for still-missing fields; the accumulated asin flows to later providers.
	async enrichFromProviders(
		input: Partial<BookMetadata> & {
			bookId: number;
			uuid: string;
			serverId?: string | null;
			amazonDomain?: string;
		},
		order?: MetadataProviderName[],
	) {
		const providerOrder = await this.resolveProviderOrder(input.bookId, order);

		// Resolve the owning org once so providers read tenant-scoped config
		// (Amazon domain/cookie, RanobeDB toggle). Library-less books fall back to
		// defaults; runs in a worker, so it can't come from session context.
		const serverId =
			input.serverId ??
			(await bookMetadataRepository.getServerIdByBookId(input.bookId));

		// Per-library override layered over the org default: Amazon store.
		// Undefined lets the provider fall back to the org default.
		const libraryConfig = await bookMetadataRepository.getLibraryMetadataConfig(
			input.bookId,
		);
		const amazonDomain = libraryConfig?.amazon?.domain;

		let acc = { ...input, serverId, amazonDomain };
		let authorsProvider: MetadataProviderName | null = null;
		let anyResult = false;
		let blockedError: AmazonTransientError | null = null;

		for (const name of providerOrder) {
			const fields = PROVIDER_FIELDS[name];
			const missing = fields.some((field) => this.isFieldMissing(acc[field]));
			if (!missing) continue;

			let result: Partial<BookMetadata>;
			try {
				result = await PROVIDERS[name].getMetadata(acc);
			} catch (error) {
				// Anti-bot block is transient, not "no data": remember it, keep going
				// (earlier results still save), and raise a rate-limit error if empty.
				if (error instanceof AmazonTransientError) {
					blockedError = error;
					continue;
				}
				throw error;
			}
			if (Object.keys(result).length === 0) continue;

			anyResult = true;
			// Authors from the first provider that returns them win; later
			// providers only fill in when none were found yet.
			const authorsOverride = authorsProvider === null;
			acc = {
				...this.mergeMetadata(acc, result, { authorsOverride }),
				bookId: input.bookId,
				uuid: input.uuid,
				serverId,
				amazonDomain,
			};
			if (authorsOverride && result.authors && result.authors.length > 0) {
				authorsProvider = name;
			}
		}

		if (!anyResult) {
			// A block with no other results is a rate-limit, not a real miss — raise
			// it so the UI says "retry" instead of marking the book enriched.
			if (blockedError) {
				throw new TooManyRequestsError(
					"Amazon is temporarily rate-limiting requests. Wait a few minutes and try again.",
				);
			}
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

	// Back-compat alias (worker + manual endpoint); runs the full provider chain.
	async enrichFromAmazon(
		input: Partial<BookMetadata> & {
			bookId: number;
			uuid: string;
			serverId?: string | null;
			amazonDomain?: string;
		},
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

	// Restore metadata to the original EPUB snapshot: clear enriched data
	// (authors, genres, series) and re-save from the original.
	async restoreOriginal(bookId: number) {
		const original = await bookMetadataRepository.getOriginalMetadata(bookId);
		if (!original) return null;

		const data = original as Record<string, unknown>;

		// Capture current links before clearing so we can clean up orphans
		const [previousAuthors, previousSeriesIds] = await Promise.all([
			bookMetadataRepository.getBookAuthors(bookId),
			bookMetadataRepository.getBookSeriesIds(bookId),
		]);

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

		const metadata = data as Partial<BookMetadata>;
		return this.saveMetadata(metadata, bookId, {
			providerTag: "LOCAL",
		});
	}

	// Core save logic shared by the enrich entry points.
	private async saveMetadata(
		metadata: Partial<BookMetadata>,
		bookId: number,
		options?: SaveOptions,
	) {
		// Catalog entities (publisher/series/author/genre) are scoped per-server.
		// Library-less books skip entity upserts but still save scalar metadata.
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
			serverId: _serverId,
			amazonDomain: _amazonDomain,
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
			const genreNames = metadata.genres.map((genre) =>
				typeof genre === "string" ? genre : genre.name,
			);
			await bookMetadataRepository.upsertGenresAndLink(
				bookId,
				genreNames,
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

	// Merge, keeping existing values. With authorsOverride (default) provider
	// authors replace existing ones; otherwise they only fill gaps.
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
