import { coverColorQueue } from "../../../infrastructure/queue/queues/cover-color.queue";
import {
	enqueueAuthorSync,
	enqueueSearchSync,
	enqueueSeriesSync,
} from "../../../infrastructure/search/search-sync.service";
import { logger } from "../../../lib/logger";
import { inferSeriesFromTitle } from "../../../modules/audiobookSeriesInference";
import type {
	AudiobookAuthor,
	AudiobookMetadata,
	ManualAudiobookMetadata,
} from "./audiobook-metadata.model";
import { audiobookMetadataRepository } from "./metadata.repository";
import { audibleProvider } from "./providers/audible.provider";
import {
	type AudiobookProviderName,
	type AudiobookSearchCandidate,
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

// Fields each provider may contribute — a secondary provider is skipped when
// nothing it could fill is still missing.
const PROVIDER_FIELDS: Record<
	AudiobookProviderName,
	(keyof AudiobookMetadata)[]
> = {
	audible: [
		"title",
		"subtitle",
		"description",
		"asin",
		"isbn",
		"languageCode",
		"publishedDate",
		"duration",
		"abridged",
		"cover",
		"authors",
		"narrators",
		"publisher",
		"series",
		"genres",
		"tags",
		"audibleRating",
	],
	itunes: [
		"title",
		"description",
		"publishedDate",
		"genres",
		"cover",
		"authors",
	],
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
		return PROVIDERS[name].search(
			{ title: input.title ?? undefined, authors: input.authors },
			{ region },
		);
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

		let acc: EnrichInput = { ...input };
		let matchedProvider: AudiobookProviderName | null = null;
		let chapters: ProviderChapters | null = null;
		let asinMatched = false;

		// An ASIN from the file tags is an exact identifier: resolve it straight
		// through Audnexus (not geo-blocked) instead of searching the catalog.
		if (isValidAsin(input.asin) && order.includes("audible")) {
			const asin = input.asin.trim().toUpperCase();
			const audible = PROVIDERS.audible;
			const full = await audible.getById(asin, {
				region,
				bookUuid: input.uuid,
			});
			if (full) {
				acc = {
					...this.mergeMetadata(acc, full, { entityOverride: true }),
					bookId,
					uuid: input.uuid,
				};
				matchedProvider = "audible";
				asinMatched = true;
				log.info({ title, asin }, "Direct ASIN match");
				if (audible.getChapters) {
					chapters = await audible
						.getChapters(asin, { region })
						.catch(() => null);
				}
			}
		}

		for (const name of order) {
			if (name === "audible" && asinMatched) continue;
			const provider = PROVIDERS[name];
			const isPrimary = matchedProvider === null;

			// Secondary providers only run when they could still fill something.
			if (!isPrimary) {
				const stillMissing = PROVIDER_FIELDS[name].some((field) =>
					this.isFieldMissing(acc[field]),
				);
				if (!stillMissing) continue;
			}

			const best = await this.searchBestMatch(
				provider,
				title,
				input.authors ?? undefined,
				region,
				input.duration ?? null,
			);
			if (!best) continue;

			const full = await provider.getById(best.providerId, {
				region,
				bookUuid: input.uuid,
			});
			if (!full) continue;

			// Primary: full record wins (authors/narrators override).
			// Secondary: fill-missing only.
			acc = {
				...this.mergeMetadata(acc, full, { entityOverride: isPrimary }),
				bookId,
				uuid: input.uuid,
			};

			if (isPrimary) {
				matchedProvider = name;
				log.info(
					{
						title,
						matchTitle: best.title,
						provider: name,
						providerId: best.providerId,
					},
					"Quick match",
				);
				if (provider.getChapters) {
					chapters = await provider
						.getChapters(best.providerId, { region })
						.catch(() => null);
				}
			}
		}

		if (!matchedProvider) {
			// Record the attempt so rescans don't hammer the providers.
			await audiobookMetadataRepository.markEnriched(bookId, null);
			return null;
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

		await audiobookMetadataRepository.markEnriched(bookId, matchedProvider);
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

		const result = await provider.getById(providerId, {
			region,
			bookUuid: uuid,
		});
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

	private async resolveRegion(bookId: number, override?: string) {
		if (override) return override;
		const config = await audiobookMetadataRepository
			.getLibraryMetadataConfig(bookId)
			.catch(() => null);
		return config?.audible?.region ?? "us";
	}

	// Search with the raw title, then retry once with volume/format noise
	// stripped — series volumes often only match under the clean title.
	private async searchBestMatch(
		provider: IAudiobookMetadataProvider,
		title: string,
		authors: { name: string }[] | undefined,
		region: string,
		duration: number | null,
	): Promise<AudiobookSearchCandidate | null> {
		const candidates = await provider.search({ title, authors }, { region });
		const best = this.findBestMatch(title, candidates, { authors, duration });
		if (best) return best;

		const cleaned = cleanVolumeNoise(title);
		if (cleaned === title || cleaned.length === 0) return null;

		const retry = await provider.search(
			{ title: cleaned, authors },
			{ region },
		);
		return this.findBestMatch(cleaned, retry, { authors, duration });
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

	// Best candidate by weighted title/duration/author confidence; returns it
	// only if the composite score >= 0.6. Duration is the strongest edition and
	// volume disambiguator (same-series titles score nearly identical bigrams),
	// but weights renormalize over available components so title-only matching
	// (iTunes candidates, unprobed files) behaves exactly as before.
	private findBestMatch(
		title: string,
		candidates: AudiobookSearchCandidate[],
		context?: {
			authors?: { name: string }[];
			duration?: number | null;
		},
	): AudiobookSearchCandidate | null {
		const MIN_CONFIDENCE = 0.6;
		let bestScore = 0;
		let bestCandidate: AudiobookSearchCandidate | null = null;

		for (const candidate of candidates) {
			if (!candidate.title || !candidate.providerId) continue;
			const score = matchConfidence(
				title,
				{
					title: candidate.title,
					duration: candidate.duration ?? undefined,
					authors: candidate.authors ?? undefined,
				},
				context,
			);
			if (score > bestScore) {
				bestScore = score;
				bestCandidate = candidate;
			}
		}

		return bestScore >= MIN_CONFIDENCE ? bestCandidate : null;
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

// ── Title cleanup for search retries ─────────────────────────────────────

// Strips bracketed segments and volume/format suffixes: "Vol. 3", "#3",
// "Book 3", "(Unabridged)", trailing track numbers.
export function cleanVolumeNoise(title: string): string {
	return title
		.replace(/[([{][^)\]}]*[)\]}]/g, " ")
		.replace(/\b(?:vol(?:ume)?|book|part|disc|cd)\.?\s*\d+(?:\.\d+)?\b/gi, " ")
		.replace(/#\s*\d+(?:\.\d+)?\b/g, " ")
		.replace(/\bunabridged\b/gi, " ")
		.replace(/[-–—:,]\s*$/g, " ")
		.replace(/\s{2,}/g, " ")
		.trim();
}

// ── Match confidence (title + duration + author) ─────────────────────────

const CONFIDENCE_WEIGHTS = { title: 0.6, duration: 0.3, author: 0.1 };

// Weighted mean over the components both sides actually have. Exported for
// tests.
export function matchConfidence(
	title: string,
	candidate: {
		title?: string;
		duration?: number;
		authors?: { name: string }[];
	},
	context?: { authors?: { name: string }[]; duration?: number | null },
): number {
	const parts: { score: number; weight: number }[] = [
		{
			score: titleSimilarity(title, candidate.title ?? ""),
			weight: CONFIDENCE_WEIGHTS.title,
		},
	];

	if (context?.duration && candidate.duration) {
		parts.push({
			score: durationScore(context.duration, candidate.duration),
			weight: CONFIDENCE_WEIGHTS.duration,
		});
	}

	if (context?.authors?.length && candidate.authors?.length) {
		parts.push({
			score: authorSimilarity(context.authors, candidate.authors),
			weight: CONFIDENCE_WEIGHTS.author,
		});
	}

	const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
	return parts.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight;
}

// Piecewise on the runtime gap (seconds): <=1 min apart is a perfect score
// (Audible reports whole minutes), fading linearly to 0 at 10 min.
function durationScore(aSec: number, bSec: number): number {
	const diffMin = Math.abs(aSec - bSec) / 60;
	if (diffMin <= 1) return 1;
	if (diffMin >= 10) return 0;
	return 1 - (diffMin - 1) / 9;
}

// Best pairwise similarity between local and candidate author names.
function authorSimilarity(
	local: { name: string }[],
	remote: { name: string }[],
): number {
	let best = 0;
	for (const a of local) {
		for (const b of remote) {
			const score = titleSimilarity(a.name, b.name);
			if (score > best) best = score;
		}
	}
	return best;
}

// ── Title similarity (bigram-based Dice coefficient) ─────────────────────

function bigrams(str: string): Set<string> {
	const s = str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
	const set = new Set<string>();
	for (let i = 0; i < s.length - 1; i++) {
		set.add(s.slice(i, i + 2));
	}
	return set;
}

function titleSimilarity(a: string, b: string): number {
	const bigramsA = bigrams(a);
	const bigramsB = bigrams(b);
	if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
	if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

	let intersection = 0;
	for (const bg of bigramsA) {
		if (bigramsB.has(bg)) intersection++;
	}

	return (2 * intersection) / (bigramsA.size + bigramsB.size);
}
