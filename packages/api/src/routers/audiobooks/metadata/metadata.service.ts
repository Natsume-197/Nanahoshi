import { coverColorQueue } from "../../../infrastructure/queue/queues/cover-color.queue";
import {
	enqueueAuthorSync,
	enqueueSearchSync,
	enqueueSeriesSync,
} from "../../../infrastructure/search/search-sync.service";
import { logger } from "../../../lib/logger";
import type {
	AudiobookAuthor,
	AudiobookMetadata,
} from "./audiobook-metadata.model";
import { audiobookMetadataRepository } from "./metadata.repository";
import { audibleProvider } from "./providers/audible.provider";

const log = logger.child({ component: "audiobook-metadata-service" });

type EnrichInput = Partial<AudiobookMetadata> & {
	bookId: number;
	uuid: string;
};

export class AudiobookMetadataService {
	/**
	 * Search Audible for matching audiobooks.
	 * Returns lightweight candidates for the user to pick from.
	 */
	async searchAudible(
		input: { title?: string; authors?: { name: string }[] },
		region = "us",
	) {
		return audibleProvider.search(
			{
				title: input.title ?? undefined,
				authors: input.authors,
			},
			region,
		);
	}

	/**
	 * Automatic enrichment: search Audible by title/author, pick the best
	 * match if similarity is high enough, and enrich. Used during scanning.
	 */
	async quickMatch(input: EnrichInput, region = "us") {
		const { bookId } = input;

		// Skip if already enriched
		if (await audiobookMetadataRepository.isAudibleEnriched(bookId)) {
			return null;
		}

		const title = input.title;
		if (!title) return null;

		const candidates = await audibleProvider.search(
			{
				title,
				authors: input.authors,
			},
			region,
		);

		if (candidates.length === 0) return null;

		// Find the best match by title similarity
		const bestMatch = this.findBestMatch(title, candidates);
		if (!bestMatch?.asin) return null;

		log.info(
			{ title, matchTitle: bestMatch.title, asin: bestMatch.asin },
			"Quick match",
		);

		return this.enrichFromAudible({ ...input, asin: bestMatch.asin }, region);
	}

	/**
	 * Enrich an audiobook with metadata from Audible/Audnexus by ASIN.
	 * Downloads cover, fetches chapters, merges with existing data.
	 */
	async enrichFromAudible(input: EnrichInput, region = "us") {
		const { bookId, uuid } = input;

		if (!input.asin) return null;

		const result = await audibleProvider.getByAsin(input.asin, region, uuid);
		if (!result) return null;

		const metadata = this.mergeMetadata(input, result);
		const saved = await this.saveMetadata(metadata, bookId);

		// Fetch and replace chapters from Audnexus
		try {
			const chaptersData = await audibleProvider.getChapters(
				input.asin,
				region,
			);
			if (chaptersData?.chapters?.length) {
				await audiobookMetadataRepository.replaceChapters(
					bookId,
					chaptersData.chapters.map((ch, i) => ({
						index: i,
						title: ch.title,
						startTime: ch.startOffsetSec,
						endTime: ch.startOffsetSec + ch.lengthMs / 1000,
					})),
				);
			}
		} catch (err) {
			log.warn({ err, asin: input.asin }, "Failed to fetch chapters");
		}

		return saved;
	}

	/**
	 * Core save logic: upserts publisher, series, authors, narrators,
	 * genres, metadata fields, and enqueues cover color + search sync.
	 */
	private async saveMetadata(
		metadata: Partial<AudiobookMetadata>,
		bookId: number,
	) {
		// Catalog entities are scoped per-server; resolve the book's owning server.
		const serverId =
			await audiobookMetadataRepository.getServerIdByBookId(bookId);

		// ── 1. Publisher ────────────────────────────────────────────
		let publisherId: number | undefined;
		const publisherName =
			typeof metadata.publisher === "string"
				? metadata.publisher
				: metadata.publisher?.name;
		if (publisherName && serverId) {
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

		if (metadata.series?.name && serverId) {
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
			audibleRating: _audibleRating,
			audibleReviewCount: _audibleReviewCount,
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
			saved = await audiobookMetadataRepository.upsertMetadata(bookId, toSave);
		}

		// ── 4. Authors ──────────────────────────────────────────────
		let authorIds: number[] = [];
		const replacedAuthorIds: number[] = [];
		if (metadata.authors && metadata.authors.length > 0 && serverId) {
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
		if (metadata.narrators && metadata.narrators.length > 0 && serverId) {
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

			// Cleanup orphaned narrators
			for (const prev of previousNarrators) {
				await audiobookMetadataRepository.deleteNarratorIfOrphaned(prev.id);
			}
		}

		// ── 6. Genres ───────────────────────────────────────────────
		if (metadata.genres && metadata.genres.length > 0 && serverId) {
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

		// ── 7. Enqueue cover color extraction ───────────────────────
		if (metadata.cover) {
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

	/**
	 * Find the best matching candidate by title similarity.
	 * Returns the candidate only if similarity >= 0.6 (60%).
	 */
	private findBestMatch(
		title: string,
		candidates: Partial<AudiobookMetadata>[],
	): Partial<AudiobookMetadata> | null {
		const MIN_SIMILARITY = 0.6;
		let bestScore = 0;
		let bestCandidate: Partial<AudiobookMetadata> | null = null;

		for (const candidate of candidates) {
			if (!candidate.title || !candidate.asin) continue;
			const score = titleSimilarity(title, candidate.title);
			if (score > bestScore) {
				bestScore = score;
				bestCandidate = candidate;
			}
		}

		return bestScore >= MIN_SIMILARITY ? bestCandidate : null;
	}

	/**
	 * Merge metadata giving priority to Audible data for key fields,
	 * but keeping existing values for fields Audible didn't provide.
	 */
	private mergeMetadata(
		base: Partial<AudiobookMetadata>,
		audible: Partial<AudiobookMetadata>,
	): Partial<AudiobookMetadata> {
		const result = { ...base };
		for (const key of Object.keys(audible) as (keyof AudiobookMetadata)[]) {
			// Audible authors/narrators take priority (better identification)
			if (key === "authors" || key === "narrators") {
				const audibleArray = audible[key];
				if (audibleArray && audibleArray.length > 0) {
					(result as Record<string, unknown>)[key] = audibleArray;
				}
				continue;
			}
			// For other fields, only fill in blanks
			if (
				result[key] === undefined ||
				result[key] === null ||
				result[key] === ""
			) {
				(result as Record<string, unknown>)[key] = audible[key];
			}
		}
		return result;
	}
}

export const audiobookMetadataService = new AudiobookMetadataService();

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
