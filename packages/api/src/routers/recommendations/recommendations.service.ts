import { enqueueUserRefresh } from "../../modules/recommendations/recommendation.scheduler";
import type { WorkKind } from "../../modules/recommendations/types";
import type { LibraryScope } from "../_shared/library-scope";
import { isRecommendationsEnabled } from "../settings/settings.service";
import { impressionStore } from "./impression.store";
import type {
	ContinueSeriesItem,
	ForUserOutput,
	MixRow,
	RecommendationFormat,
	RecommendationItem,
} from "./recommendations.model";
import {
	type RepresentativeRow,
	recommendationsRepository,
} from "./recommendations.repository";
import {
	computeSessionBoost,
	filterFlatRows,
	isSuppressed,
	rerankMixRows,
	type ServingContext,
	workKey,
} from "./rerank";

// Over-fetch factor for flat (similar/popular) endpoints so the consumed/
// dismissed filter can re-cap to the requested limit without shrinking.
const FLAT_OVERFETCH = 2;
// How many recent engagement works seed the session boost.
const SESSION_SEED_LIMIT = 20;

/** Freshness-only context (dismisses); no session boost — for flat endpoints. */
async function loadServingContext(
	serverId: string,
	userId: string,
): Promise<ServingContext> {
	return {
		dismissed: await recommendationsRepository.loadDismissedWorks(
			serverId,
			userId,
		),
		sessionBoost: new Map(),
	};
}

/**
 * Full context for the mixed feed: dismisses + recency-decayed session boost +
 * impression history (rotation penalty).
 */
async function loadForUserContext(
	serverId: string,
	userId: string,
): Promise<ServingContext> {
	const [dismissed, seeds, impressions] = await Promise.all([
		recommendationsRepository.loadDismissedWorks(serverId, userId),
		recommendationsRepository.loadRecentPositiveSeeds(
			serverId,
			userId,
			SESSION_SEED_LIMIT,
		),
		impressionStore.load(serverId, userId),
	]);
	const similarities = await recommendationsRepository.loadSeedSimilarities(
		serverId,
		seeds,
	);
	return {
		dismissed,
		sessionBoost: computeSessionBoost(seeds, similarities, Date.now()),
		impressions,
	};
}

function toItem(row: RepresentativeRow): RecommendationItem {
	// an inaccessible reason ref degrades to a generic reason, never leaks a title
	const reasonType =
		row.reasonTitle === null && row.reason !== "popular"
			? "recommended"
			: (row.reason as RecommendationItem["reason"]["type"]);
	return {
		kind: row.kind,
		seriesUuid: row.seriesUuid,
		seriesName: row.seriesName,
		book: {
			uuid: row.bookUuid,
			title: row.bookTitle,
			filename: row.bookFilename,
			cover: row.bookCover,
			mainColor: row.bookMainColor,
			authors: row.authors ?? [],
			mediaType: row.bookMediaType,
		},
		reason: { type: reasonType, refTitle: row.reasonTitle },
		score: Number(row.score),
	};
}

/**
 * Completes a short personalized rail without repeating a work or its resolved
 * display volume. Popularity is only a final serving fallback: personalized
 * rows always remain in their own mixes and the client appends this mix last.
 */
function selectBackfillRows(
	rows: RepresentativeRow[],
	ctx: ServingContext,
	personalized: RepresentativeRow[],
	limit: number,
): RepresentativeRow[] {
	if (limit <= 0) return [];
	const seenWorks = new Set(
		personalized.map((row) => workKey(row.kind, row.itemId)),
	);
	const seenBooks = new Set(personalized.map((row) => row.bookUuid));
	const selected: RepresentativeRow[] = [];
	for (const row of rows) {
		const key = workKey(row.kind, row.itemId);
		if (
			isSuppressed(row, ctx) ||
			seenWorks.has(key) ||
			seenBooks.has(row.bookUuid)
		) {
			continue;
		}
		seenWorks.add(key);
		seenBooks.add(row.bookUuid);
		selected.push(row);
		if (selected.length >= limit) break;
	}
	return selected;
}

export async function forUser(
	userId: string,
	serverId: string,
	scope: LibraryScope,
	options: { format: RecommendationFormat; perMixLimit: number },
): Promise<ForUserOutput> {
	if (!(await isRecommendationsEnabled(serverId))) {
		return { enabled: false, mixes: [] };
	}

	const [headers, items, ctx] = await Promise.all([
		recommendationsRepository.listMixHeaders(serverId, userId, scope),
		recommendationsRepository.listMixItems(
			serverId,
			userId,
			scope,
			options.format,
			options.perMixLimit,
		),
		loadForUserContext(serverId, userId),
	]);

	// online re-rank: drop consumed/dismissed, lean toward recent reads, re-cap
	const reranked = rerankMixRows(items, ctx, options.perMixLimit);

	const mixes: MixRow[] = [];
	for (const header of headers) {
		const mixItems = reranked
			.filter((i) => i.mixIndex === header.mixIndex)
			.map(toItem);
		if (mixItems.length === 0) continue;
		// anchored mix whose anchor became inaccessible → generic title
		mixes.push({
			mixIndex: header.mixIndex,
			anchorTitle: header.hasAnchor ? header.anchorTitle : null,
			items: mixItems,
		});
	}

	// what actually reached the screen — feeds the impression counter below
	let shownRows: RepresentativeRow[] = reranked;

	// A short personalized result is completed at read time. This catches both
	// cold start and small candidate pools after live permission/format filters.
	const personalizedBookCount = new Set(reranked.map((row) => row.bookUuid))
		.size;
	const deficit = Math.max(0, options.perMixLimit - personalizedBookCount);
	if (deficit > 0) {
		const popular = await recommendationsRepository.topPopular(
			serverId,
			userId,
			scope,
			options.format,
			options.perMixLimit * FLAT_OVERFETCH,
		);
		const backfill = selectBackfillRows(popular, ctx, reranked, deficit);
		if (backfill.length > 0) {
			const nextMixIndex =
				Math.max(-1, ...mixes.map((mix) => mix.mixIndex)) + 1;
			mixes.push({
				mixIndex: nextMixIndex,
				anchorTitle: null,
				items: backfill.map(toItem),
			});
			shownRows = [...reranked, ...backfill];
		}
	}

	// fire-and-forget: serving latency never waits on impression bookkeeping
	if (shownRows.length > 0) {
		void impressionStore.record(
			serverId,
			userId,
			shownRows.map((row) => workKey(row.kind, row.itemId)),
			ctx.impressions ?? new Map(),
		);
	}

	return { enabled: true, mixes };
}

/**
 * Deterministic rail, not the taste engine: works even with recommendations
 * disabled for the server (like Continue Reading, it only reflects the user's
 * own progress/shelves).
 */
export async function continueSeries(
	userId: string,
	serverId: string,
	scope: LibraryScope,
	options: { format: RecommendationFormat; limit: number },
): Promise<{ items: ContinueSeriesItem[] }> {
	const rows = await recommendationsRepository.listContinueSeries(
		serverId,
		userId,
		scope,
		options.format,
		options.limit,
	);
	return {
		items: rows.map((row) => ({
			seriesUuid: row.seriesUuid,
			seriesName: row.seriesName,
			nextPosition: row.nextPosition === null ? null : Number(row.nextPosition),
			book: {
				uuid: row.bookUuid,
				title: row.bookTitle,
				filename: row.bookFilename,
				cover: row.bookCover,
				mainColor: row.bookMainColor,
				authors: row.authors ?? [],
				mediaType: row.bookMediaType,
			},
		})),
	};
}

export async function popular(
	userId: string,
	serverId: string,
	scope: LibraryScope,
	options: { format: RecommendationFormat; limit: number },
): Promise<{ enabled: boolean; items: RecommendationItem[] }> {
	if (!(await isRecommendationsEnabled(serverId))) {
		return { enabled: false, items: [] };
	}
	const rows = await recommendationsRepository.topPopular(
		serverId,
		userId,
		scope,
		options.format,
		options.limit * FLAT_OVERFETCH,
	);
	const ctx = await loadServingContext(serverId, userId);
	return {
		enabled: true,
		items: filterFlatRows(rows, ctx, options.limit).map(toItem),
	};
}

export async function similarToBook(
	userId: string,
	serverId: string,
	scope: LibraryScope,
	input: { bookUuid: string; format: RecommendationFormat; limit: number },
): Promise<{ enabled: boolean; items: RecommendationItem[] }> {
	if (!(await isRecommendationsEnabled(serverId))) {
		return { enabled: false, items: [] };
	}
	const work = await recommendationsRepository.resolveWorkForBook(
		serverId,
		input.bookUuid,
	);
	if (!work) return { enabled: true, items: [] };
	const [rows, ctx] = await Promise.all([
		recommendationsRepository.listSimilar(
			serverId,
			userId,
			scope,
			work,
			input.format,
			input.limit * FLAT_OVERFETCH,
		),
		loadServingContext(serverId, userId),
	]);
	return {
		enabled: true,
		items: filterFlatRows(rows, ctx, input.limit).map(toItem),
	};
}

async function resolveWork(
	serverId: string,
	input: { bookUuid?: string; seriesUuid?: string },
): Promise<{ kind: WorkKind; id: number } | null> {
	if (input.bookUuid) {
		return recommendationsRepository.resolveWorkForBook(
			serverId,
			input.bookUuid,
		);
	}
	if (input.seriesUuid) {
		const id = await recommendationsRepository.resolveSeriesId(
			serverId,
			input.seriesUuid,
		);
		return id === null ? null : { kind: "series", id };
	}
	return null;
}

export async function setNotInterested(
	userId: string,
	serverId: string,
	input: { bookUuid?: string; seriesUuid?: string },
	interested: boolean,
): Promise<{ ok: boolean }> {
	if (!(await isRecommendationsEnabled(serverId))) return { ok: false };
	const work = await resolveWork(serverId, input);
	if (!work) return { ok: false };
	if (interested) {
		await recommendationsRepository.removeNotInterested(serverId, userId, work);
	} else {
		await recommendationsRepository.addNotInterested(serverId, userId, work);
	}
	// propagate to similar candidates on the next (debounced) refresh
	await enqueueUserRefresh(serverId, userId);
	return { ok: true };
}

export async function similarToSeries(
	userId: string,
	serverId: string,
	scope: LibraryScope,
	input: { seriesUuid: string; format: RecommendationFormat; limit: number },
): Promise<{ enabled: boolean; items: RecommendationItem[] }> {
	if (!(await isRecommendationsEnabled(serverId))) {
		return { enabled: false, items: [] };
	}
	const seriesId = await recommendationsRepository.resolveSeriesId(
		serverId,
		input.seriesUuid,
	);
	if (seriesId === null) return { enabled: true, items: [] };
	const [rows, ctx] = await Promise.all([
		recommendationsRepository.listSimilar(
			serverId,
			userId,
			scope,
			{ kind: "series", id: seriesId },
			input.format,
			input.limit * FLAT_OVERFETCH,
		),
		loadServingContext(serverId, userId),
	]);
	return {
		enabled: true,
		items: filterFlatRows(rows, ctx, input.limit).map(toItem),
	};
}
