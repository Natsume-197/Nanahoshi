import { TooManyRequestsError } from "../../../errors";
import { coverColorQueue } from "../../../infrastructure/queue/queues/cover-color.queue";
import {
	enqueueAuthorSync,
	enqueueSearchSync,
	enqueueSeriesSync,
} from "../../../infrastructure/search/search-sync.service";
import { logger } from "../../../lib/logger";
import {
	cleanAudiobookTitle,
	rankAudiobookCandidate,
} from "../../../modules/audiobookMatch";
import { inferSeriesFromTitle } from "../../../modules/audiobookSeriesInference";
import { CatalogProviderError } from "../../../modules/catalogEnrichment";
import type {
	AudiobookAuthor,
	AudiobookMetadata,
	ManualAudiobookMetadata,
} from "./audiobook-metadata.model";
import { runAudiobookCatalogEnrichment } from "./audiobookCatalogEnrichment";
import { audiobookMetadataRepository } from "./metadata.repository";
import { audibleProvider } from "./providers/audible.provider";
import {
	type AudiobookProviderName,
	type IAudiobookMetadataProvider,
	isValidAsin,
	type ProviderChapters,
} from "./providers/IMetadata.provider";
import { itunesProvider } from "./providers/itunes.provider";

const log = logger.child({ component: "audiobook-metadata-service" });

export const DEFAULT_AUDIOBOOK_PROVIDER_ORDER: AudiobookProviderName[] = [
	"audible",
	"itunes",
];

const PROVIDERS: Record<AudiobookProviderName, IAudiobookMetadataProvider> = {
	audible: audibleProvider,
	itunes: itunesProvider,
};

type EnrichInput = Partial<AudiobookMetadata> & {
	bookId: number;
	uuid: string;
	/** Original filename — series-inference fallback when tags lack the volume marker. */
	filename?: string | null;
};

export class AudiobookMetadataService {
	// Search a single provider for matching audiobooks; returns lightweight
	// candidates for the user to pick from.
	async searchProvider(
		name: AudiobookProviderName,
		input: { title?: string; authors?: { name: string }[] },
		region?: string,
	) {
		try {
			return await PROVIDERS[name].search(
				{ title: input.title ?? undefined, authors: input.authors },
				{ region },
			);
		} catch (error) {
			this.raiseProviderError(name, error);
		}
	}

	// Same, but resolving the book's library region (Audible store / iTunes
	// country) when the caller doesn't pass one — manual search must hit the
	// same store the automatic enrichment uses. An ASIN always resolves via
	// the Audnexus proxy first (exact and not geo-blocked); title search on
	// the selected provider is the fallback.
	async searchProviderForBook(
		name: AudiobookProviderName,
		bookId: number,
		input: { title?: string; authors?: { name: string }[]; asin?: string },
		regionOverride?: string,
	) {
		const region = await this.resolveRegion(bookId, regionOverride);

		if (isValidAsin(input.asin)) {
			const viaAsin = await this.searchProvider(
				"audible",
				{ title: input.asin.trim() },
				region,
			);
			if (viaAsin.length > 0) return viaAsin;
		}

		return this.searchProvider(name, input, region);
	}

	// Backward-compatible alias (public OpenAPI surface).
	async searchAudible(
		input: { title?: string; authors?: { name: string }[] },
		region?: string,
	) {
		return this.searchProvider("audible", input, region);
	}

	// Automatic enrichment across the library's provider chain: the first
	// provider with a confident match supplies the full record (chapters
	// included); later providers only fill fields still missing.
	async quickMatch(input: EnrichInput, regionOverride?: string) {
		const { bookId } = input;

		if (await audiobookMetadataRepository.isEnriched(bookId)) {
			return null;
		}

		const title = input.title;
		if (!title) return null;

		const [order, region] = await Promise.all([
			this.resolveProviderOrder(bookId),
			this.resolveRegion(bookId, regionOverride),
		]);

		const protectedFields = await audiobookMetadataRepository
			.getLockedFields(bookId)
			.catch(() => []);
		const result = await runAudiobookCatalogEnrichment({
			metadata: { ...input },
			providers: order.map((name) => PROVIDERS[name]),
			region,
			protectedFields: protectedFields as (keyof EnrichInput)[],
		});
		if (result.status === "retryable_failure") {
			log.warn(
				{ failures: result.failures },
				"Audiobook enrichment is retryable",
			);
			return null;
		}
		if (result.status === "no_match") {
			if (result.failures.length > 0) {
				log.warn(
					{ failures: result.failures },
					"Audiobook enrichment completed without a match",
				);
			}
			await audiobookMetadataRepository.markEnriched(bookId, null);
			return null;
		}
		const acc = result.metadata;
		if (result.failures.length > 0) {
			log.warn(
				{ failures: result.failures },
				"Audiobook enrichment completed with provider failures",
			);
		}

		// Providers without series data (e.g. iTunes as primary) leave the
		// volume-marker inference from the title/filename as last resort, with
		// common-prefix resolution so multi-subtitle volumes share one series.
		if (this.isFieldMissing(acc.series)) {
			const inferred =
				inferSeriesFromTitle(title) ??
				inferSeriesFromTitle(input.filename?.replace(/\.[^.]+$/, ""));
			if (inferred) {
				const serverId =
					await audiobookMetadataRepository.getServerIdByBookId(bookId);
				const resolved = serverId
					? await audiobookMetadataRepository.resolveInferredSeries(
							inferred.seriesName,
							serverId,
						)
					: { name: inferred.seriesName };
				acc.series = {
					name: resolved.name,
					position: inferred.position,
				};
			}
		}

		const saved = await this.saveMetadata(acc, bookId);

		const primaryProvider = PROVIDERS[result.primaryProvider];
		const chapters: ProviderChapters | null = primaryProvider.getChapters
			? await primaryProvider
					.getChapters(result.primaryProviderId, { region })
					.catch(() => null)
			: null;
		if (chapters?.chapters?.length) {
			try {
				await audiobookMetadataRepository.replaceChapters(
					bookId,
					chapters.chapters.map((ch, i) => ({ index: i, ...ch })),
				);
			} catch (err) {
				log.warn({ err, bookId }, "Failed to save chapters");
			}
		}

		// A match with no author is treated as a partial (likely a transient
		// provider gap) and stays retryable on later scans up to the repo cap.
		const matchedWithAuthor = (acc.authors?.length ?? 0) > 0;
		await audiobookMetadataRepository.markEnriched(
			bookId,
			result.primaryProvider,
			matchedWithAuthor && !result.retryable,
		);
		return saved;
	}

	// Enrich an audiobook from a specific provider by its id: download cover,
	// fetch chapters when available, merge with existing data.
	async enrichFromProvider(
		name: AudiobookProviderName,
		input: EnrichInput & { providerId: string },
		regionOverride?: string,
	) {
		const { bookId, uuid, providerId } = input;
		const provider = PROVIDERS[name];
		const region = await this.resolveRegion(bookId, regionOverride);

		let result: Partial<AudiobookMetadata> | null;
		try {
			result = await provider.getById(providerId, {
				region,
				bookUuid: uuid,
			});
		} catch (error) {
			this.raiseProviderError(name, error);
		}
		if (!result) return null;

		const metadata = this.mergeMetadata(input, result, {
			entityOverride: true,
		});
		const saved = await this.saveMetadata(metadata, bookId);

		if (provider.getChapters) {
			try {
				const chaptersData = await provider.getChapters(providerId, { region });
				if (chaptersData?.chapters?.length) {
					await audiobookMetadataRepository.replaceChapters(
						bookId,
						chaptersData.chapters.map((ch, i) => ({ index: i, ...ch })),
					);
				}
			} catch (err) {
				log.warn({ err, providerId }, "Failed to fetch chapters");
			}
		}

		await audiobookMetadataRepository.markEnriched(bookId, name);
		return saved;
	}

	// Backward-compatible alias (public OpenAPI surface).
	async enrichFromAudible(input: EnrichInput, region?: string) {
		if (!input.asin) return null;
		return this.enrichFromProvider(
			"audible",
			{ ...input, providerId: input.asin },
			region,
		);
	}

	// ---------- Provider chain resolution ----------

	private async resolveProviderOrder(
		bookId: number,
	): Promise<AudiobookProviderName[]> {
		const fromLibrary = await audiobookMetadataRepository
			.getLibraryProviderOrder(bookId)
			.catch(() => null);
		// Stale ebook ids on old audiobook libraries filter to [] → default.
		const valid =
			fromLibrary?.filter(
				(name): name is AudiobookProviderName => name in PROVIDERS,
			) ?? [];
		return valid.length > 0 ? valid : DEFAULT_AUDIOBOOK_PROVIDER_ORDER;
	}

	private raiseProviderError(
		provider: AudiobookProviderName,
		error: unknown,
	): never {
		if (error instanceof CatalogProviderError && error.kind === "transient") {
			throw new TooManyRequestsError(
				`${provider} is temporarily unavailable (${error.code}). Try again later.`,
			);
		}
		throw error;
	}

	private async resolveRegion(bookId: number, override?: string) {
		if (override) return override;
		const config = await audiobookMetadataRepository
			.getLibraryMetadataConfig(bookId)
			.catch(() => null);
		return config?.audible?.region ?? "us";
	}

	private isFieldMissing(value: unknown): boolean {
		if (value === undefined || value === null || value === "") return true;
		return Array.isArray(value) && value.length === 0;
	}

	// Manual per-field edit: saves exactly the provided fields (null clears),
	// bypassing locks, then locks every edited field so enrichment never
	// overwrites a user edit. unlockFields re-opens fields to enrichment.
	async applyManualEdit(
		bookId: number,
		edit: ManualAudiobookMetadata,
		unlockFields: string[] = [],
	) {
		const serverId =
			await audiobookMetadataRepository.getServerIdByBookId(bookId);
		const editedFields = Object.keys(edit).filter(
			(key) => edit[key as keyof ManualAudiobookMetadata] !== undefined,
		);

		const { authors, narrators, publisher, series, genres, tags, ...scalars } =
			edit;
		const scalarPatch: Record<string, unknown> = Object.fromEntries(
			Object.entries(scalars).filter(([, v]) => v !== undefined),
		);

		if (publisher !== undefined) {
			if (publisher === null) {
				scalarPatch.publisherId = null;
			} else if (serverId) {
				scalarPatch.publisherId =
					await audiobookMetadataRepository.upsertPublisher(
						publisher,
						serverId,
					);
			}
		}

		// Always runs (even with an empty patch) so the row exists for the locks.
		const saved = await audiobookMetadataRepository.upsertMetadata(
			bookId,
			scalarPatch,
		);

		const syncSeriesIds: number[] = [];
		if (series !== undefined && serverId) {
			const previousSeriesIds =
				await audiobookMetadataRepository.getBookSeriesIds(bookId);
			if (series === null) {
				if (previousSeriesIds.length > 0) {
					await audiobookMetadataRepository.clearBookSeries(bookId);
					for (const oldId of previousSeriesIds) {
						await audiobookMetadataRepository.deleteSeriesIfOrphaned(oldId);
					}
					syncSeriesIds.push(...previousSeriesIds);
				}
			} else {
				const seriesId = await audiobookMetadataRepository.upsertSeries(
					series.name,
					serverId,
				);
				const oldIds = previousSeriesIds.filter((id) => id !== seriesId);
				if (oldIds.length > 0) {
					await audiobookMetadataRepository.clearBookSeries(bookId);
				}
				await audiobookMetadataRepository.linkBookSeries(
					bookId,
					seriesId,
					series.position ?? null,
				);
				for (const oldId of oldIds) {
					await audiobookMetadataRepository.deleteSeriesIfOrphaned(oldId);
				}
				syncSeriesIds.push(seriesId, ...oldIds);
			}
		}

		const syncAuthorIds: number[] = [];
		if (authors !== undefined && serverId) {
			const previousAuthors =
				await audiobookMetadataRepository.getBookAuthors(bookId);
			await audiobookMetadataRepository.clearBookAuthors(bookId);
			const newAuthorIds = await Promise.all(
				authors.map(async (a) => {
					const authorId = await audiobookMetadataRepository.upsertAuthor(
						a.name,
						serverId,
					);
					await audiobookMetadataRepository.linkBookAuthor(
						bookId,
						authorId,
						a.role ?? "Author",
					);
					return authorId;
				}),
			);
			const kept = new Set(newAuthorIds);
			for (const prev of previousAuthors) {
				if (!kept.has(prev.id)) {
					await audiobookMetadataRepository.deleteAuthorIfOrphaned(prev.id);
					syncAuthorIds.push(prev.id);
				}
			}
			syncAuthorIds.push(...newAuthorIds);
		}

		if (narrators !== undefined && serverId) {
			const previousNarrators =
				await audiobookMetadataRepository.getBookNarrators(bookId);
			await audiobookMetadataRepository.clearBookNarrators(bookId);
			for (const n of narrators) {
				const narratorId = await audiobookMetadataRepository.upsertNarrator(
					n.name,
					serverId,
				);
				await audiobookMetadataRepository.linkBookNarrator(bookId, narratorId);
			}
			for (const prev of previousNarrators) {
				await audiobookMetadataRepository.deleteNarratorIfOrphaned(prev.id);
			}
		}

		// Genres/tags are full replacements: what the user saved is the whole set.
		if (genres !== undefined && serverId) {
			await audiobookMetadataRepository.clearBookGenres(bookId);
			for (const genreName of genres) {
				const genreId = await audiobookMetadataRepository.upsertGenre(
					genreName,
					serverId,
				);
				await audiobookMetadataRepository.linkBookGenre(bookId, genreId);
			}
		}
		if (tags !== undefined && serverId) {
			await audiobookMetadataRepository.clearBookTags(bookId);
			await audiobookMetadataRepository.upsertTagsAndLink(
				bookId,
				tags,
				serverId,
			);
		}

		await audiobookMetadataRepository.addLockedFields(bookId, editedFields);
		await audiobookMetadataRepository.removeLockedFields(bookId, unlockFields);

		await Promise.all([
			enqueueSearchSync(bookId, "update"),
			...syncSeriesIds.map((id) => enqueueSeriesSync(id)),
			...syncAuthorIds.map((id) => enqueueAuthorSync(id)),
		]);

		return saved;
	}

	// Core save logic: upsert publisher, series, authors, narrators, genres,
	// metadata fields, then enqueue cover color + search sync.
	// Manual edits bypass locks via respectLocks: false (they create them);
	// every enrichment path leaves it on so locked fields survive.
	private async saveMetadata(
		metadata: Partial<AudiobookMetadata>,
		bookId: number,
		options?: { respectLocks?: boolean },
	) {
		// Catalog entities are scoped per-server; resolve the book's owning server.
		const serverId =
			await audiobookMetadataRepository.getServerIdByBookId(bookId);

		const locked = new Set(
			options?.respectLocks === false
				? []
				: await audiobookMetadataRepository.getLockedFields(bookId),
		);

		// ── 1. Publisher ────────────────────────────────────────────
		let publisherId: number | undefined;
		const publisherName =
			typeof metadata.publisher === "string"
				? metadata.publisher
				: metadata.publisher?.name;
		if (publisherName && serverId && !locked.has("publisher")) {
			publisherId = await audiobookMetadataRepository.upsertPublisher(
				publisherName,
				serverId,
			);
		}

		// ── 2. Series ───────────────────────────────────────────────
		let seriesId: number | undefined;
		const replacedSeriesIds: number[] = [];
		const previousSeriesIds =
			await audiobookMetadataRepository.getBookSeriesIds(bookId);

		if (metadata.series?.name && serverId && !locked.has("series")) {
			seriesId = await audiobookMetadataRepository.upsertSeries(
				metadata.series.name,
				serverId,
			);
			const oldSeriesIds = previousSeriesIds.filter((id) => id !== seriesId);
			if (oldSeriesIds.length > 0) {
				await audiobookMetadataRepository.clearBookSeries(bookId);
				replacedSeriesIds.push(...oldSeriesIds);
			}
			await audiobookMetadataRepository.linkBookSeries(
				bookId,
				seriesId,
				metadata.series.position ?? null,
			);
			for (const oldId of oldSeriesIds) {
				await audiobookMetadataRepository.deleteSeriesIfOrphaned(oldId);
			}
		}

		// ── 3. Base metadata fields ─────────────────────────────────
		const {
			publisher: _publisher,
			authors: _authors,
			narrators: _narrators,
			series: _series,
			genres: _genres,
			tags: _tags,
			audibleRating: _audibleRating,
			audibleReviewCount: _audibleReviewCount,
			bookId: _bookId,
			uuid: _uuid,
			filename: _filename,
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
			saved = await audiobookMetadataRepository.upsertMetadata(bookId, toSave);
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
			const previousAuthors =
				await audiobookMetadataRepository.getBookAuthors(bookId);
			if (previousAuthors.length > 0) {
				await audiobookMetadataRepository.clearBookAuthors(bookId);
			}

			authorIds = await Promise.all(
				metadata.authors.map(async (a: AudiobookAuthor) => {
					const authorId = await audiobookMetadataRepository.upsertAuthor(
						a.name,
						serverId,
					);
					await audiobookMetadataRepository.linkBookAuthor(
						bookId,
						authorId,
						a.role ?? "Author",
					);
					return authorId;
				}),
			);

			const newAuthorIdSet = new Set(authorIds);
			for (const prev of previousAuthors) {
				if (!newAuthorIdSet.has(prev.id)) {
					await audiobookMetadataRepository.deleteAuthorIfOrphaned(prev.id);
					replacedAuthorIds.push(prev.id);
				}
			}
		}

		// ── 5. Narrators ────────────────────────────────────────────
		if (
			metadata.narrators &&
			metadata.narrators.length > 0 &&
			serverId &&
			!locked.has("narrators")
		) {
			const previousNarrators =
				await audiobookMetadataRepository.getBookNarrators(bookId);
			if (previousNarrators.length > 0) {
				await audiobookMetadataRepository.clearBookNarrators(bookId);
			}

			for (const n of metadata.narrators) {
				const narratorId = await audiobookMetadataRepository.upsertNarrator(
					n.name,
					serverId,
				);
				await audiobookMetadataRepository.linkBookNarrator(bookId, narratorId);
			}

			for (const prev of previousNarrators) {
				await audiobookMetadataRepository.deleteNarratorIfOrphaned(prev.id);
			}
		}

		// ── 6. Genres ───────────────────────────────────────────────
		if (
			metadata.genres &&
			metadata.genres.length > 0 &&
			serverId &&
			!locked.has("genres")
		) {
			await Promise.all(
				metadata.genres.map(async (genreName: string) => {
					const genreId = await audiobookMetadataRepository.upsertGenre(
						genreName,
						serverId,
					);
					await audiobookMetadataRepository.linkBookGenre(bookId, genreId);
				}),
			);
		}

		// ── 6b. Tags ────────────────────────────────────────────────
		if (
			metadata.tags &&
			metadata.tags.length > 0 &&
			serverId &&
			!locked.has("tags")
		) {
			await audiobookMetadataRepository.upsertTagsAndLink(
				bookId,
				metadata.tags,
				serverId,
			);
		}

		// ── 7. Enqueue cover color extraction ───────────────────────
		if (metadata.cover && !locked.has("cover")) {
			await coverColorQueue
				.add(
					"extract",
					{
						bookId: Number(bookId),
						coverPath: metadata.cover,
						mediaType: "audiobook" as const,
					},
					{ removeOnComplete: true, removeOnFail: 100 },
				)
				.catch(() => {});
		}

		// ── 8. Sync search index ────────────────────────────────────
		await Promise.all([
			enqueueSearchSync(bookId, "update"),
			seriesId ? enqueueSeriesSync(seriesId) : undefined,
			...authorIds.map((id) => enqueueAuthorSync(id)),
			...replacedSeriesIds.map((id) => enqueueSeriesSync(id)),
			...replacedAuthorIds.map((id) => enqueueAuthorSync(id)),
		]);

		return saved;
	}

	// Merge provider data into the accumulated record. With entityOverride
	// (primary match) provider authors/narrators replace existing ones (better
	// identification); otherwise every field only fills in blanks.
	private mergeMetadata(
		base: Partial<AudiobookMetadata>,
		incoming: Partial<AudiobookMetadata>,
		options?: { entityOverride?: boolean },
	): Partial<AudiobookMetadata> {
		const result = { ...base };
		for (const key of Object.keys(incoming) as (keyof AudiobookMetadata)[]) {
			if (key === "authors" || key === "narrators") {
				const incomingArray = incoming[key];
				if (!incomingArray || incomingArray.length === 0) continue;
				if (options?.entityOverride || this.isFieldMissing(result[key])) {
					(result as Record<string, unknown>)[key] = incomingArray;
				}
				continue;
			}
			// For other fields, only fill in blanks
			if (this.isFieldMissing(result[key])) {
				(result as Record<string, unknown>)[key] = incoming[key];
			}
		}
		return result;
	}
}

export const audiobookMetadataService = new AudiobookMetadataService();

export const cleanVolumeNoise = cleanAudiobookTitle;
export const matchConfidence = rankAudiobookCandidate;
