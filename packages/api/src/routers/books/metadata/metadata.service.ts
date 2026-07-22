import { TooManyRequestsError } from "../../../errors";
import { coverColorQueue } from "../../../infrastructure/queue/queues/cover-color.queue";
import {
	enqueueAuthorSync,
	enqueueSearchSync,
	enqueueSeriesSync,
} from "../../../infrastructure/search/search-sync.service";
import { logger } from "../../../lib/logger";
import type { BookMetadata, ManualBookMetadata } from "./book.metadata.model";
import {
	type MetadataProviderName,
	needsBookCatalogEnrichment,
	runBookCatalogEnrichment,
} from "./bookCatalogEnrichment";
import { bookMetadataRepository } from "./metadata.repository";
import { normalizeSeriesAliases } from "./metadata.utils";
import { amazonProvider } from "./providers/amazon.provider";
import { comicvineProvider } from "./providers/comicvine.provider";
import { goodreadsProvider } from "./providers/goodreads.provider";
import { googlebooksProvider } from "./providers/googlebooks.provider";
import { hardcoverProvider } from "./providers/hardcover.provider";
import type {
	BookSearchCandidate,
	IMetadataProvider,
	ISearchableMetadataProvider,
} from "./providers/IMetadata.provider";
import { localProvider } from "./providers/local.provider";
import { openlibraryProvider } from "./providers/openlibrary.provider";
import { ProviderTransientError } from "./providers/provider.utils";
import { ranobedbProvider } from "./providers/ranobedb.provider";

export type { MetadataProviderName } from "./bookCatalogEnrichment";

const log = logger.child({ component: "book-metadata-service" });

type SaveOptions = {
	providerTag?:
		| "LOCAL"
		| "AMAZON"
		| "RANOBEDB"
		| "GOOGLEBOOKS"
		| "OPENLIBRARY"
		| "GOODREADS"
		| "COMICVINE"
		| "HARDCOVER";
	// Manual edits bypass locks (they're the ones that create them); every
	// automated path leaves this on so locked fields survive enrichment/rescans.
	respectLocks?: boolean;
};

export const DEFAULT_PROVIDER_ORDER: MetadataProviderName[] = [
	"ranobedb",
	"amazon",
	"googlebooks",
	"openlibrary",
	"goodreads",
	"hardcover",
	"comicvine",
];

const PROVIDERS: Record<MetadataProviderName, IMetadataProvider> = {
	ranobedb: ranobedbProvider,
	amazon: amazonProvider,
	googlebooks: googlebooksProvider,
	openlibrary: openlibraryProvider,
	goodreads: goodreadsProvider,
	comicvine: comicvineProvider,
	hardcover: hardcoverProvider,
};

const SEARCHABLE_PROVIDERS: Record<
	MetadataProviderName,
	ISearchableMetadataProvider
> = {
	ranobedb: ranobedbProvider,
	amazon: amazonProvider,
	googlebooks: googlebooksProvider,
	openlibrary: openlibraryProvider,
	goodreads: goodreadsProvider,
	comicvine: comicvineProvider,
	hardcover: hardcoverProvider,
};

const PROVIDER_TAGS: Record<
	MetadataProviderName,
	NonNullable<SaveOptions["providerTag"]>
> = {
	ranobedb: "RANOBEDB",
	amazon: "AMAZON",
	googlebooks: "GOOGLEBOOKS",
	openlibrary: "OPENLIBRARY",
	goodreads: "GOODREADS",
	comicvine: "COMICVINE",
	hardcover: "HARDCOVER",
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
	// refresh: providers are re-consulted even for filled fields and their fresh
	// values win over stale DB data (locks still apply at save time).
	async enrichFromProviders(
		input: Partial<BookMetadata> & {
			bookId: number;
			uuid: string;
			serverId?: string | null;
			amazonDomain?: string;
		},
		order?: MetadataProviderName[],
		options?: { refresh?: boolean },
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
		const protectedFields = await bookMetadataRepository.getLockedFields(
			input.bookId,
		);
		const result = await runBookCatalogEnrichment({
			metadata: { ...input, serverId, amazonDomain },
			providers: providerOrder.map((name) => ({
				name,
				provider: PROVIDERS[name],
			})),
			protectedFields: protectedFields as (keyof BookMetadata)[],
			refresh: options?.refresh,
		});

		if (result.status === "retryable_failure") {
			log.warn({ failures: result.failures }, "Book enrichment is retryable");
			throw new TooManyRequestsError(
				"A metadata provider is temporarily unavailable. Wait a few minutes and try again.",
			);
		}
		if (result.status === "no_match") {
			if (result.failures.length > 0) {
				log.warn(
					{ failures: result.failures },
					"Book enrichment completed without a match",
				);
			}
			await bookMetadataRepository.markAmazonEnriched(input.bookId);
			return null;
		}
		if (result.failures.length > 0) {
			log.warn(
				{ failures: result.failures },
				"Book enrichment completed with provider failures",
			);
		}
		const saved = await this.saveMetadata(result.metadata, input.bookId, {
			providerTag: result.authorsProvider
				? PROVIDER_TAGS[result.authorsProvider]
				: "LOCAL",
		});
		if (!result.retryable) {
			await bookMetadataRepository.markAmazonEnriched(input.bookId);
		}
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

	// Reprocess gate: true when any provider in this book's chain could still
	// contribute a missing field. Cheap DB check, no provider calls.
	async needsExternalEnrichment(bookId: number): Promise<boolean> {
		const gaps = await bookMetadataRepository.getEnrichmentGaps(bookId);
		if (!gaps) return false;
		const order = await this.resolveProviderOrder(bookId);
		const values: Record<string, unknown> = {
			...gaps,
			authors: gaps.hasAuthors ? [true] : [],
			series: gaps.hasSeries ? {} : null,
			genres: gaps.hasGenres ? [true] : [],
			tags: gaps.hasTags ? [true] : [],
		};
		return needsBookCatalogEnrichment(values, order);
	}

	private isFieldMissing(value: unknown): boolean {
		if (value === undefined || value === null || value === "") return true;
		if (Array.isArray(value)) return value.length === 0;
		return false;
	}

	// Restore metadata to the original EPUB snapshot: clear enriched data
	// (authors, genres, series) and re-save from the original. Manual-edit
	// locks are wiped too — "restore original" means discarding user edits.
	async restoreOriginal(bookId: number) {
		const original = await bookMetadataRepository.getOriginalMetadata(bookId);
		if (!original) return null;

		await bookMetadataRepository.setLockedFields(bookId, []);

		const data = original as Record<string, unknown>;

		// Capture current links before clearing so we can clean up orphans
		const [previousAuthors, previousSeriesIds] = await Promise.all([
			bookMetadataRepository.getBookAuthors(bookId),
			bookMetadataRepository.getBookSeriesIds(bookId),
		]);

		await Promise.all([
			bookMetadataRepository.clearBookAuthors(bookId),
			bookMetadataRepository.clearBookGenres(bookId),
			bookMetadataRepository.clearBookTags(bookId),
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

		// Reset every mutable metadata column before re-applying the snapshot.
		// saveMetadata intentionally ignores undefined fields, so only clearing the
		// obvious provider fields leaves stale values behind whenever the EPUB did
		// not contain that field (for example titleRomaji, publisher or date).
		// mainColor is cleared with cover and will be recomputed by saveMetadata's
		// cover-color job when the original snapshot has a cover.
		await bookMetadataRepository.resetMetadata(bookId, {
			title: null,
			titleRomaji: null,
			subtitle: null,
			description: null,
			publishedDate: null,
			languageCode: null,
			pageCount: null,
			isbn10: null,
			isbn13: null,
			asin: null,
			embeddedUid: null,
			cover: null,
			amountChars: null,
			publisherId: null,
			mainColor: null,
			amazonRating: null,
			amazonReviewCount: null,
			amazonEnrichedAt: null,
		});

		const metadata = data as Partial<BookMetadata>;
		return this.saveMetadata(metadata, bookId, {
			providerTag: "LOCAL",
		});
	}

	// Providers the fix-match UI should offer: enabled for the tenant AND
	// carrying any required credential (Comicvine key, Hardcover token). The
	// answer is tenant-level, not book-level. Order follows the default chain.
	async getAvailableProviders(
		serverId: string | null | undefined,
	): Promise<MetadataProviderName[]> {
		const checks = await Promise.all(
			DEFAULT_PROVIDER_ORDER.map(async (name) => {
				const available = await SEARCHABLE_PROVIDERS[name]
					.isAvailable(serverId)
					.catch(() => false);
				return available ? name : null;
			}),
		);
		return checks.filter((name): name is MetadataProviderName => name !== null);
	}

	// Manual fix-match search: query one provider for candidates the user picks
	// from. Amazon needs the tenant/library store config; RanobeDB ignores it.
	// A pasted ASIN resolves the exact product first; title search is the
	// fallback.
	async searchProvider(
		name: MetadataProviderName,
		bookId: number,
		input: { title?: string; author?: string; asin?: string },
	): Promise<BookSearchCandidate[]> {
		const provider = SEARCHABLE_PROVIDERS[name];
		const serverId = await bookMetadataRepository.getServerIdByBookId(bookId);
		const libraryConfig =
			await bookMetadataRepository.getLibraryMetadataConfig(bookId);
		const options = {
			serverId,
			amazonDomain: libraryConfig?.amazon?.domain,
		};
		try {
			const asin = input.asin?.trim().toUpperCase();
			if (asin && /^[A-Z0-9]{10}$/.test(asin)) {
				const exact = await SEARCHABLE_PROVIDERS.amazon.getById(asin, {
					...options,
					keepRemoteCover: true,
				});
				if (exact?.title) {
					return [
						{
							provider: "amazon",
							providerId: asin,
							title: exact.title,
							titleRomaji: exact.titleRomaji ?? null,
							authors: exact.authors?.map((a) => ({ name: a.name })),
							series: exact.series
								? {
										name: exact.series.name,
										position: exact.series.position ?? null,
									}
								: null,
							publishedDate: exact.publishedDate ?? null,
							previewCover: exact.cover ?? null,
							url: await amazonProvider.productUrl(asin, options),
						},
					];
				}
			}
			return await provider.search(input, options);
		} catch (error) {
			this.raiseProviderError(error);
		}
	}

	// Transient provider failures surface to the UI as "retry later", not a crash.
	private raiseProviderError(error: unknown): never {
		if (error instanceof ProviderTransientError) {
			throw new TooManyRequestsError(
				`${error.message}. Wait a few minutes and try again.`,
			);
		}
		throw error;
	}

	// Manual fix-match apply: fetch the chosen candidate's full record by id and
	// save it. The picked record's entities replace the current ones (that's the
	// point of re-matching), but locked fields still win — a manual field edit
	// outranks a manual re-match.
	async applyFromProvider(
		name: MetadataProviderName,
		input: { bookId: number; uuid: string; providerId: string },
	) {
		const provider = SEARCHABLE_PROVIDERS[name];
		const serverId = await bookMetadataRepository.getServerIdByBookId(
			input.bookId,
		);
		const libraryConfig = await bookMetadataRepository.getLibraryMetadataConfig(
			input.bookId,
		);

		let result: Partial<BookMetadata> | null;
		try {
			result = await provider.getById(input.providerId, {
				serverId,
				amazonDomain: libraryConfig?.amazon?.domain,
				uuid: input.uuid,
			});
		} catch (error) {
			this.raiseProviderError(error);
		}
		if (!result || Object.keys(result).length === 0) return null;

		const saved = await this.saveMetadata(result, input.bookId, {
			providerTag: PROVIDER_TAGS[name],
		});
		await bookMetadataRepository.markAmazonEnriched(input.bookId);
		return saved;
	}

	// Manual per-field edit: saves exactly the provided fields (null clears),
	// bypassing locks, then locks every edited field so enrichment/rescan never
	// overwrites a user edit. unlockFields re-opens fields to enrichment.
	async applyManualEdit(
		bookId: number,
		edit: ManualBookMetadata,
		unlockFields: string[] = [],
	) {
		const serverId = await bookMetadataRepository.getServerIdByBookId(bookId);
		const editedFields = Object.keys(edit).filter(
			(key) => edit[key as keyof ManualBookMetadata] !== undefined,
		);

		const { authors, publisher, series, genres, tags, ...scalars } = edit;
		const scalarPatch: Record<string, unknown> = Object.fromEntries(
			Object.entries(scalars).filter(([, v]) => v !== undefined),
		);

		if (publisher !== undefined) {
			if (publisher === null) {
				scalarPatch.publisherId = null;
			} else if (serverId) {
				scalarPatch.publisherId = await bookMetadataRepository.upsertPublisher(
					publisher,
					serverId,
				);
			}
		}

		// Always runs (even with an empty patch) so the row exists for the locks.
		const saved = await bookMetadataRepository.upsertMetadata(
			bookId,
			scalarPatch,
		);

		const syncSeriesIds: number[] = [];
		if (series !== undefined && serverId) {
			const previousSeriesIds =
				await bookMetadataRepository.getBookSeriesIds(bookId);
			if (series === null) {
				if (previousSeriesIds.length > 0) {
					await bookMetadataRepository.clearBookSeries(bookId);
					for (const oldId of previousSeriesIds) {
						await bookMetadataRepository.deleteSeriesIfOrphaned(oldId);
					}
					syncSeriesIds.push(...previousSeriesIds);
				}
			} else {
				const seriesId = await bookMetadataRepository.upsertSeries(
					series.name,
					serverId,
				);
				const oldIds = previousSeriesIds.filter((id) => id !== seriesId);
				if (oldIds.length > 0) {
					await bookMetadataRepository.clearBookSeries(bookId);
				}
				await bookMetadataRepository.linkBookSeries(
					bookId,
					seriesId,
					series.position ?? null,
				);
				for (const oldId of oldIds) {
					await bookMetadataRepository.deleteSeriesIfOrphaned(oldId);
				}
				syncSeriesIds.push(seriesId, ...oldIds);
			}
		}

		const syncAuthorIds: number[] = [];
		if (authors !== undefined && serverId) {
			const { authorIds, removedAuthorIds } =
				await bookMetadataRepository.replaceBookAuthors(
					bookId,
					authors,
					"LOCAL",
					serverId,
				);
			if (removedAuthorIds.length > 0) {
				await bookMetadataRepository.deleteAuthorsIfOrphaned(removedAuthorIds);
			}
			syncAuthorIds.push(...authorIds, ...removedAuthorIds);
		}

		// Genres/tags are full replacements: what the user saved is the whole set.
		if (genres !== undefined && serverId) {
			await bookMetadataRepository.clearBookGenres(bookId);
			await bookMetadataRepository.upsertGenresAndLink(
				bookId,
				genres,
				serverId,
			);
		}
		if (tags !== undefined && serverId) {
			await bookMetadataRepository.clearBookTags(bookId);
			await bookMetadataRepository.upsertTagsAndLink(bookId, tags, serverId);
		}

		await bookMetadataRepository.addLockedFields(bookId, editedFields);
		await bookMetadataRepository.removeLockedFields(bookId, unlockFields);

		await Promise.all([
			enqueueSearchSync(bookId, "update"),
			...syncSeriesIds.map((id) => enqueueSeriesSync(id)),
			...syncAuthorIds.map((id) => enqueueAuthorSync(id)),
		]);

		return saved;
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

		const locked = new Set(
			options?.respectLocks === false
				? []
				: await bookMetadataRepository.getLockedFields(bookId),
		);

		// ── 1. Publisher ────────────────────────────────────────────
		let publisherId: number | undefined;
		const publisherName =
			typeof metadata.publisher === "string"
				? metadata.publisher
				: metadata.publisher?.name;
		if (publisherName && serverId && !locked.has("publisher")) {
			publisherId = await bookMetadataRepository.upsertPublisher(
				publisherName,
				serverId,
			);
		}

		// ── 2. Series ───────────────────────────────────────────────
		let seriesId: number | undefined;
		const replacedSeriesIds: number[] = [];
		let aliasDependentBookIds: number[] = [];
		if (metadata.series?.name && serverId && !locked.has("series")) {
			const previousSeriesIds =
				await bookMetadataRepository.getBookSeriesIds(bookId);
			seriesId = await bookMetadataRepository.upsertSeries(
				metadata.series.name,
				serverId,
			);
			if (metadata.series.aliases !== undefined) {
				const aliasesChanged = await bookMetadataRepository.updateSeriesAliases(
					seriesId,
					metadata.series.aliases,
				);
				if (aliasesChanged) {
					aliasDependentBookIds =
						await bookMetadataRepository.getBookIdsBySeriesId(seriesId);
				}
			}
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
			tags: _tags,
			bookId: _bookId,
			uuid: _uuid,
			serverId: _serverId,
			amazonDomain: _amazonDomain,
			...metadataFields
		} = metadata as Record<string, unknown>;
		for (const key of Object.keys(metadataFields)) {
			if (locked.has(key)) delete metadataFields[key];
		}
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
		if (
			metadata.authors &&
			metadata.authors.length > 0 &&
			serverId &&
			!locked.has("authors")
		) {
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
		if (
			metadata.genres &&
			metadata.genres.length > 0 &&
			serverId &&
			!locked.has("genres")
		) {
			const genreNames = metadata.genres.map((genre) =>
				typeof genre === "string" ? genre : genre.name,
			);
			await bookMetadataRepository.upsertGenresAndLink(
				bookId,
				genreNames,
				serverId,
			);
		}

		// ── 5b. Tags ────────────────────────────────────────────────
		if (
			metadata.tags &&
			metadata.tags.length > 0 &&
			serverId &&
			!locked.has("tags")
		) {
			await bookMetadataRepository.upsertTagsAndLink(
				bookId,
				metadata.tags,
				serverId,
			);
		}

		// ── 6. Enqueue cover color extraction (non-blocking) ────────
		if (metadata.cover && !locked.has("cover")) {
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
		const syncBookIds = new Set([bookId, ...aliasDependentBookIds]);
		await Promise.all([
			...[...syncBookIds].map((id) => enqueueSearchSync(id, "update")),
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
				key === "series" &&
				result.series &&
				extra.series?.aliases !== undefined
			) {
				result.series = {
					...result.series,
					aliases: normalizeSeriesAliases(
						[
							...(result.series.aliases ?? []),
							extra.series.name,
							...extra.series.aliases,
						],
						result.series.name,
					),
				};
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
