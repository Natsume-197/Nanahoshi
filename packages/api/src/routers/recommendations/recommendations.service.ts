import { enqueueUserRefresh } from "../../modules/recommendations/recommendation.scheduler";
import type { WorkKind } from "../../modules/recommendations/types";
import type { LibraryScope } from "../_shared/library-scope";
import { isRecommendationsEnabled } from "../settings/settings.service";
import type {
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
	rerankMixRows,
	type ServingContext,
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

/** Full context for the mixed feed: dismisses + recency-decayed session boost. */
async function loadForUserContext(
	serverId: string,
	userId: string,
): Promise<ServingContext> {
	const [dismissed, seeds] = await Promise.all([
		recommendationsRepository.loadDismissedWorks(serverId, userId),
		recommendationsRepository.loadRecentPositiveSeeds(
			serverId,
			userId,
			SESSION_SEED_LIMIT,
		),
	]);
	const similarities = await recommendationsRepository.loadSeedSimilarities(
		serverId,
		seeds,
	);
	return {
		dismissed,
		sessionBoost: computeSessionBoost(seeds, similarities, Date.now()),
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
			authors: row.authors ?? [],
			mediaType: row.bookMediaType,
		},
		reason: { type: reasonType, refTitle: row.reasonTitle },
		score: Number(row.score),
	};
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

	// nothing computed yet (fresh server/user) → popularity fallback at read time
	if (mixes.length === 0) {
		const popular = await recommendationsRepository.topPopular(
			serverId,
			userId,
			scope,
			options.format,
			options.perMixLimit * FLAT_OVERFETCH,
		);
		const filtered = filterFlatRows(popular, ctx, options.perMixLimit);
		if (filtered.length > 0) {
			mixes.push({
				mixIndex: 0,
				anchorTitle: null,
				items: filtered.map(toItem),
			});
		}
	}

	return { enabled: true, mixes };
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
