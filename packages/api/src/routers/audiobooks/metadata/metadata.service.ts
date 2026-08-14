import { TooManyRequestsError } from "../../../errors";
import { providerGate } from "../../../infrastructure/providerGate";
import { providerQuotaScope } from "../../../infrastructure/providerQuotaScope";
import { coverIngestQueue } from "../../../infrastructure/queue/queues/cover-ingest.queue";
import { logger } from "../../../lib/logger";
import {
	cleanAudiobookTitle,
	rankAudiobookCandidate,
} from "../../../modules/audiobookMatch";
import { inferSeriesFromTitle } from "../../../modules/audiobookSeriesInference";
import { CatalogProviderError } from "../../../modules/catalogEnrichment";
import {
	AUDIOBOOK_OUTCOME_POLICY,
	providerUnavailableMessage,
	resolveMatchOutcome,
	summarizeFailures,
} from "../../../modules/metadataEnrichment/enrichment-outcome";
import {
	normalizeProviderPolicy,
	type RawProviderConfig,
} from "../../../modules/providerPolicy";
import { enrichmentStateRepository } from "../../enrichment/enrichment.repository";
import type {
	AudiobookAuthor,
	AudiobookMetadata,
	ManualAudiobookMetadata,
} from "./audiobook-metadata.model";
import { runAudiobookCatalogEnrichment } from "./audiobookCatalogEnrichment";
import { audiobookMetadataRepository } from "./metadata.repository";
import {
	type AudiobookProviderName,
	isValidAsin,
	type ProviderChapters,
} from "./providers/IMetadata.provider";
import {
	AUDIOBOOK_PROVIDER_IDS,
	isAudiobookProviderName,
} from "./providers/provider.manifest";
import { AUDIOBOOK_PROVIDERS } from "./providers/registry";

const log = logger.child({ component: "audiobook-metadata-service" });

export const DEFAULT_AUDIOBOOK_PROVIDER_ORDER: readonly AudiobookProviderName[] =
	AUDIOBOOK_PROVIDER_IDS;

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
		await this.assertProviderAvailable(name, region);
		try {
			return await AUDIOBOOK_PROVIDERS[name].search(
				{ title: input.title ?? undefined, authors: input.authors },
				{ region },
			);
		} catch (error) {
			return await this.raiseProviderError(name, error, region);
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

		if (await enrichmentStateRepository.isTerminal(bookId)) {
			return null;
		}

		const title = input.title;
		if (!title) return null;

		const [routing, region, protectedFields, existingCover] = await Promise.all(
			[
				this.resolveRoutingPolicy(bookId),
				this.resolveRegion(bookId, regionOverride),
				audiobookMetadataRepository.getLockedFields(bookId).catch(() => []),
				audiobookMetadataRepository.getCoverByBookId(bookId),
			],
		);

		// Enrichment callers intentionally carry only matching evidence, not the
		// complete row. Rehydrate the stored cover so provider art remains a
		// fallback and can never displace artwork acquired from the source files.
		const initialMetadata = {
			...input,
			...(existingCover ? { cover: existingCover } : {}),
		};
		const state = await enrichmentStateRepository.get(bookId);
		const manualMatch = state?.matched.find(
			(match) => match.manual && match.providerId,
		);
		const manualProvider = manualMatch?.provider as
			| AudiobookProviderName
			| undefined;
		if (
			manualMatch?.providerId &&
			(!manualProvider ||
				!Object.hasOwn(AUDIOBOOK_PROVIDERS, manualProvider) ||
				!routing.order.includes(manualProvider))
		) {
			return null;
		}
		const result = await runAudiobookCatalogEnrichment({
			metadata: initialMetadata,
			providers: routing.order.map((name) => AUDIOBOOK_PROVIDERS[name]),
			region,
			protectedFields: protectedFields as (keyof EnrichInput)[],
			routing,
			requiredPrimaryMatch: manualMatch?.providerId
				? {
						provider: manualProvider as AudiobookProviderName,
						providerId: manualMatch.providerId,
					}
				: undefined,
		});
		const { failures, nextRetryAt, transientProviders } = summarizeFailures(
			result.failures,
		);
		if (result.status === "retryable_failure") {
			log.warn(
				{ failures: result.failures },
				"Audiobook enrichment is retryable",
			);
			await enrichmentStateRepository.recordFailures(
				bookId,
				failures,
				nextRetryAt,
			);
			// Same convention as written books: a Deferred Enrichment Retry is
			// already persisted, so the worker must not let BullMQ burn its own
			// attempts inside the provider's cooldown window.
			throw new TooManyRequestsError(
				providerUnavailableMessage(transientProviders),
			);
		}
		if (result.status === "no_match") {
			if (result.failures.length > 0) {
				log.warn(
					{ failures: result.failures },
					"Audiobook enrichment completed without a match",
				);
			}
			await enrichmentStateRepository.recordRun(bookId, {
				status: "no_match",
				decision: result.decision,
				failures,
			});
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

		const metadataToSave = { ...acc };
		if (existingCover) {
			// Cover Ingest may have replaced the acquired path with a master while
			// providers were in flight. The existing cover is not provider output,
			// so never write its potentially stale snapshot back over that update.
			delete metadataToSave.cover;
		}
		const saved = await this.saveMetadata(metadataToSave, bookId, {
			fieldSources: result.fieldSources,
		});

		const primaryProvider = AUDIOBOOK_PROVIDERS[result.primaryProvider];
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

		// Graded after the save, so series inference and merged authors count.
		const outcome = resolveMatchOutcome(result, AUDIOBOOK_OUTCOME_POLICY, {
			hasAuthors: (acc.authors?.length ?? 0) > 0,
		});
		if (outcome.kind === "run") {
			await enrichmentStateRepository.recordRun(bookId, {
				status: outcome.status,
				matched: result.matches,
				failures,
			});
		} else {
			await enrichmentStateRepository.recordPartialMatch(bookId, {
				matched: result.matches,
				failures,
				nextRetryAt,
			});
		}
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
		const provider = AUDIOBOOK_PROVIDERS[name];
		const [region, existingCover] = await Promise.all([
			this.resolveRegion(bookId, regionOverride),
			audiobookMetadataRepository.getCoverByBookId(bookId),
		]);
		await this.assertProviderAvailable(name, region);
		// The manual apply route also sends a partial row; enforce the same cover
		// priority at this service boundary instead of relying on every caller.
		const current = {
			...input,
			...(existingCover ? { cover: existingCover } : {}),
		};

		let result: Partial<AudiobookMetadata> | null;
		try {
			result = await provider.getById(providerId, {
				region,
				bookUuid: this.isFieldMissing(current.cover) ? uuid : undefined,
			});
		} catch (error) {
			return await this.raiseProviderError(name, error, region);
		}
		if (!result) return null;

		const metadata = this.mergeMetadata(current, result, {
			entityOverride: true,
		});
		if (existingCover) delete metadata.cover;
		const saved = await this.saveMetadata(metadata, bookId, { source: name });

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

		await enrichmentStateRepository.recordRun(bookId, {
			status: "enriched",
			matched: [{ provider: name, providerId, manual: true }],
		});
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

	// Library config (legacy array or routed {order, fields}) normalized to a
	// routing policy. Stale ebook ids on old audiobook libraries filter out and
	// fall back to the default order.
	private async resolveRoutingPolicy(bookId: number) {
		const raw = (await audiobookMetadataRepository
			.getLibraryProviderOrder(bookId)
			.catch(() => null)) as RawProviderConfig;
		return normalizeProviderPolicy(
			raw,
			isAudiobookProviderName,
			DEFAULT_AUDIOBOOK_PROVIDER_ORDER,
		);
	}

	// A provider in cooldown fails fast with a named, actionable message.
	private async assertProviderAvailable(
		name: AudiobookProviderName,
		region?: string,
	) {
		const cooldownMs = await providerGate.cooldownRemainingMs(
			name,
			providerQuotaScope(name, { region }),
		);
		if (cooldownMs != null) {
			throw new TooManyRequestsError(
				`${name} is rate-limited. Try again in ${Math.ceil(cooldownMs / 1000)}s.`,
			);
		}
	}

	// Transient provider failures surface to the UI as "retry later" — and open
	// the shared breaker so background jobs back off too.
	private async raiseProviderError(
		provider: AudiobookProviderName,
		error: unknown,
		region?: string,
	): Promise<never> {
		if (error instanceof CatalogProviderError && error.kind === "transient") {
			await providerGate.trip(
				provider,
				undefined,
				providerQuotaScope(provider, { region }),
			);
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

		if (series !== undefined && serverId) {
			const previousSeriesIds =
				await audiobookMetadataRepository.getBookSeriesIds(bookId);
			if (series === null) {
				if (previousSeriesIds.length > 0) {
					await audiobookMetadataRepository.clearBookSeries(bookId);
					for (const oldId of previousSeriesIds) {
						await audiobookMetadataRepository.deleteSeriesIfOrphaned(oldId);
					}
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
			}
		}

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
				}
			}
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

		const editedAt = new Date().toISOString();
		await audiobookMetadataRepository.mergeFieldSources(
			bookId,
			Object.fromEntries(
				editedFields.map((field) => [field, { p: "user", at: editedAt }]),
			),
		);

		return saved;
	}

	// Core save logic: upsert publisher, series, authors, narrators, genres,
	// metadata fields, then enqueue cover processing.
	// Manual edits bypass locks via respectLocks: false (they create them);
	// every enrichment path leaves it on so locked fields survive.
	private async saveMetadata(
		metadata: Partial<AudiobookMetadata>,
		bookId: number,
		options?: {
			respectLocks?: boolean;
			/** Default provenance id for every saved field ("local", "user", or a provider id). */
			source?: string;
			// Per-field provenance from a multi-provider run. When present, only
			// these fields get provenance updates.
			fieldSources?: Record<string, string>;
		},
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

		// ── 6c. Field provenance ────────────────────────────────────
		const provenance: Record<string, { p: string; at: string }> = {};
		const stampedAt = new Date().toISOString();
		const defaultSource = options?.source ?? "local";
		const explicitSources = options?.fieldSources;
		const markProvenance = (field: string) => {
			const source = explicitSources ? explicitSources[field] : defaultSource;
			if (source) provenance[field] = { p: source, at: stampedAt };
		};
		for (const key of Object.keys(metadataFields)) markProvenance(key);
		if (publisherId !== undefined) markProvenance("publisher");
		if (seriesId !== undefined) markProvenance("series");
		if (authorIds.length > 0) markProvenance("authors");
		if (metadata.narrators?.length && serverId && !locked.has("narrators")) {
			markProvenance("narrators");
		}
		if (metadata.genres?.length && serverId && !locked.has("genres")) {
			markProvenance("genres");
		}
		if (metadata.tags?.length && serverId && !locked.has("tags")) {
			markProvenance("tags");
		}
		await audiobookMetadataRepository.mergeFieldSources(bookId, provenance);

		// ── 7. Enqueue cover ingest ─────────────────────────────────
		if (metadata.cover && !locked.has("cover")) {
			await coverIngestQueue
				.add(
					"ingest",
					{
						bookId: Number(bookId),
						coverPath: metadata.cover,
						mediaType: "audiobook" as const,
					},
					{ removeOnComplete: true, removeOnFail: 100 },
				)
				.catch(() => {});
		}

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
