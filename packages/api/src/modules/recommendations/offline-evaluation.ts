import {
	type EmbeddingSpace,
	embeddingCosOf,
	generateSimilarities,
} from "./candidate-generation";
import { computePopularity } from "./popularity";
import { buildIdf } from "./scorer";
import { type SignalRow, type SignalType, selectSeeds } from "./seed-selection";
import {
	computeSessionBoost,
	type SeedSimilarity,
	type SessionSeed,
} from "./session-boost";
import { clusterSeeds } from "./taste-clustering";
import type { ScoredPair, WorkAggregate, WorkKey } from "./types";
import { parseWorkKey, workKey } from "./types";
import { buildMixes, type Mix, type SimilarityRow } from "./user-feed";
import type { UserFeedSignalInput } from "./user-feed.service";

const POSITIVE_HOLDOUT_SIGNALS = new Set(["like", "completed"]);

export interface TemporalHoldout {
	target: WorkKey;
	targetAtMs: number;
	trainingRows: UserFeedSignalInput[];
	negativeKeys: WorkKey[];
}

export interface OfflineUserHistory {
	userId: string;
	rows: UserFeedSignalInput[];
}

export interface RollingTemporalHoldout extends TemporalHoldout {
	userId: string;
	ordinal: number;
}

/**
 * Item-level leave-one-out: the latest positive work is hidden completely, and
 * signals after its timestamp are discarded. Removing every row for the target
 * prevents a shelf/progress event for the same work from leaking the answer.
 */
export function createTemporalHoldout(
	rows: UserFeedSignalInput[],
	minPositiveWorks = 3,
): TemporalHoldout | null {
	const latestPositiveByWork = new Map<WorkKey, UserFeedSignalInput>();
	for (const row of rows) {
		if (!POSITIVE_HOLDOUT_SIGNALS.has(row.signal)) continue;
		const key = workKey(row.kind, row.itemId);
		const previous = latestPositiveByWork.get(key);
		if (!previous || row.atMs > previous.atMs)
			latestPositiveByWork.set(key, row);
	}
	if (latestPositiveByWork.size < minPositiveWorks) return null;

	const targetRow = [...latestPositiveByWork.values()].sort(
		(a, b) =>
			b.atMs - a.atMs ||
			(workKey(a.kind, a.itemId) < workKey(b.kind, b.itemId) ? -1 : 1),
	)[0];
	if (!targetRow) return null;

	const target = workKey(targetRow.kind, targetRow.itemId);
	const trainingRows = rows.filter(
		(row) =>
			row.atMs <= targetRow.atMs && workKey(row.kind, row.itemId) !== target,
	);
	const negativeKeys = [
		...new Set(
			trainingRows
				.filter(
					(row) =>
						row.signal === "not_interested" || row.signal === "abandoned",
				)
				.map((row) => workKey(row.kind, row.itemId)),
		),
	];

	return {
		target,
		targetAtMs: targetRow.atMs,
		trainingRows,
		negativeKeys,
	};
}

/** Produces one chronological test case for every new positive after warm-up. */
export function createRollingTemporalHoldouts(
	histories: OfflineUserHistory[],
	minPositiveWorks = 3,
): RollingTemporalHoldout[] {
	const holdouts: RollingTemporalHoldout[] = [];
	for (const history of histories) {
		const seenPositiveWorks = new Set<WorkKey>();
		const positives = history.rows
			.filter((row) => POSITIVE_HOLDOUT_SIGNALS.has(row.signal))
			.sort(
				(a, b) =>
					a.atMs - b.atMs ||
					(workKey(a.kind, a.itemId) < workKey(b.kind, b.itemId) ? -1 : 1),
			);
		for (const event of positives) {
			const key = workKey(event.kind, event.itemId);
			if (seenPositiveWorks.has(key)) continue;
			seenPositiveWorks.add(key);
			if (seenPositiveWorks.size < minPositiveWorks) continue;
			const holdout = createTemporalHoldout(
				history.rows.filter((row) => row.atMs <= event.atMs),
				minPositiveWorks,
			);
			if (!holdout) continue;
			holdouts.push({
				...holdout,
				userId: history.userId,
				ordinal: seenPositiveWorks.size,
			});
		}
	}
	return holdouts.sort(
		(a, b) =>
			a.targetAtMs - b.targetAtMs ||
			a.userId.localeCompare(b.userId) ||
			a.ordinal - b.ordinal,
	);
}

function historicalWorksAt(
	baseWorks: WorkAggregate[],
	histories: OfflineUserHistory[],
	holdout: RollingTemporalHoldout,
): WorkAggregate[] {
	type Engagement = {
		likes: Set<string>;
		completions: Set<string>;
		engaged: Set<string>;
	};
	const engagement = new Map<WorkKey, Engagement>();
	const record = (key: WorkKey) => {
		let value = engagement.get(key);
		if (!value) {
			value = { likes: new Set(), completions: new Set(), engaged: new Set() };
			engagement.set(key, value);
		}
		return value;
	};

	for (const history of histories) {
		const rows =
			history.userId === holdout.userId
				? holdout.trainingRows
				: history.rows.filter((row) => row.atMs <= holdout.targetAtMs);
		for (const row of rows) {
			const value = record(workKey(row.kind, row.itemId));
			if (row.signal === "like") {
				value.likes.add(history.userId);
				value.engaged.add(history.userId);
			} else if (row.signal === "completed") {
				value.completions.add(history.userId);
				value.engaged.add(history.userId);
			} else if (row.signal === "shelf") {
				value.engaged.add(history.userId);
			}
		}
	}

	return baseWorks
		.filter(
			(work) =>
				work.createdAtMs === 0 || work.createdAtMs <= holdout.targetAtMs,
		)
		.map((work) => {
			const value = engagement.get(workKey(work.kind, work.id));
			return {
				...work,
				engagedUserIds: new Set(value?.engaged ?? []),
				likeCount: value?.likes.size ?? 0,
				completionCount: value?.completions.size ?? 0,
			};
		});
}

export interface HistoricalEvaluationInput {
	baseWorks: WorkAggregate[];
	histories: OfflineUserHistory[];
	embeddingSpace: EmbeddingSpace | null;
	titleKeyByWork: Map<WorkKey, string>;
	k: number;
	minPositiveWorks?: number;
	maxCases?: number;
	caseSeed?: number;
	/** Serving-time session-boost weight to apply before merge (0 = batch only). */
	sessionWeight?: number;
	/** Session-boost recency half-life to sweep (defaults to production's). */
	sessionHalfLifeDays?: number;
}

function deterministicSample<T>(values: T[], limit: number, seed: number): T[] {
	if (values.length <= limit) return values;
	let state = seed | 0;
	const random = () => {
		state = (state + 0x6d2b79f5) | 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
	const sampled = [...values];
	for (let i = sampled.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[sampled[i], sampled[j]] = [sampled[j] as T, sampled[i] as T];
	}
	return sampled.slice(0, limit);
}

function mixesFromHistoricalSnapshot(
	holdout: RollingTemporalHoldout,
	works: WorkAggregate[],
	pairs: ScoredPair[],
	embeddingSpace: EmbeddingSpace | null,
	titleKeyByWork: Map<WorkKey, string>,
): Mix[] {
	const signalRows: SignalRow[] = holdout.trainingRows.map((row) => ({
		key: workKey(row.kind, row.itemId),
		signal: row.signal as SignalType,
		atMs: row.atMs,
	}));
	const { seeds, negativeSeeds, exclusions } = selectSeeds(
		signalRows,
		holdout.targetAtMs,
	);
	const relevantSeeds = new Set(
		[...seeds, ...negativeSeeds].map((seed) => seed.key),
	);
	const similaritiesBySeed = new Map<WorkKey, SimilarityRow[]>();
	for (const pair of pairs) {
		if (!relevantSeeds.has(pair.seed)) continue;
		let rows = similaritiesBySeed.get(pair.seed);
		if (!rows) {
			rows = [];
			similaritiesBySeed.set(pair.seed, rows);
		}
		rows.push({
			cand: pair.cand,
			score: pair.score,
			components: pair.components,
			reason: pair.reason,
		});
	}
	const seedKeys = new Set(seeds.map((seed) => seed.key));
	const similarSeedPairs = new Set<string>();
	for (const [seed, rows] of similaritiesBySeed) {
		if (!seedKeys.has(seed)) continue;
		for (const row of rows)
			if (seedKeys.has(row.cand)) similarSeedPairs.add(`${seed}|${row.cand}`);
	}

	const popularityEntries = computePopularity(works);
	const popularity = new Map<WorkKey, number>();
	const popularOrder: WorkKey[] = [];
	for (const entry of popularityEntries) {
		const key = workKey(entry.kind, entry.id);
		popularity.set(key, entry.score);
		popularOrder.push(key);
	}
	const vectors = embeddingSpace
		? new Map(
				embeddingSpace.keys.map((key, index) => [
					key,
					embeddingSpace.vectors.slice(index * 384, (index + 1) * 384),
				]),
			)
		: null;
	const primaryAuthorByWork = new Map<WorkKey, number>();
	for (const work of works) {
		const authors = [...work.authorIds].sort((a, b) => a - b);
		const primary = authors[0];
		if (primary !== undefined)
			primaryAuthorByWork.set(workKey(work.kind, work.id), primary);
	}
	const clusters = clusterSeeds(seeds, vectors, similarSeedPairs);
	return buildMixes({
		clusters,
		similaritiesBySeed,
		popularity,
		popularOrder,
		exclusions,
		vectors,
		primaryAuthorByWork,
		titleKeyByWork,
		negatives: negativeSeeds.map((seed) => ({
			seed,
			sims: similaritiesBySeed.get(seed.key) ?? [],
		})),
	});
}

/** Matches the dashboard's round-robin merge so offline rank means UI rank. */
export function mergeMixesForEvaluation(
	mixes: Mix[],
	limit: number,
): WorkKey[] {
	const output: WorkKey[] = [];
	const seen = new Set<WorkKey>();
	const longest = Math.max(0, ...mixes.map((mix) => mix.items.length));
	for (let rank = 0; rank < longest && output.length < limit; rank++) {
		for (const mix of mixes) {
			const item = mix.items[rank];
			if (!item || seen.has(item.key)) continue;
			seen.add(item.key);
			output.push(item.key);
			if (output.length >= limit) break;
		}
	}
	return output;
}

export interface OfflinePrediction {
	target: WorkKey;
	recommendations: WorkKey[];
	negativeKeys: WorkKey[];
	segments?: string[];
	/** Per-cutoff artifacts override global context and prevent temporal leakage. */
	popularity?: ReadonlyMap<WorkKey, number>;
	similarity?: (a: WorkKey, b: WorkKey) => number;
}

export interface OfflineMetricSummary {
	cases: number;
	recallAtK: number;
	ndcgAtK: number;
	mrrAtK: number;
	averageListLength: number;
	catalogCoverage: number;
	novelty: number;
	intraListDiversity: number;
	exactNegativeExposureRate: number;
	similarNegativeExposureRate: number;
}

export interface OfflineEvaluationReport {
	k: number;
	overall: OfflineMetricSummary;
	segments: Record<string, OfflineMetricSummary>;
}

export interface OfflineEvaluationContext {
	k: number;
	catalogSize: number;
	popularity: ReadonlyMap<WorkKey, number>;
	similarity: (a: WorkKey, b: WorkKey) => number;
	negativeSimilarityThreshold?: number;
}

function summarize(
	predictions: OfflinePrediction[],
	context: OfflineEvaluationContext,
): OfflineMetricSummary {
	const { k, catalogSize, popularity, similarity } = context;
	const negativeThreshold = context.negativeSimilarityThreshold ?? 0.3;
	let hits = 0;
	let ndcg = 0;
	let reciprocalRank = 0;
	let recommendationCount = 0;
	let noveltySum = 0;
	let diversitySum = 0;
	let diversityPairs = 0;
	let exactNegativeExposures = 0;
	let similarNegativeExposures = 0;
	const uniqueRecommendations = new Set<WorkKey>();

	for (const prediction of predictions) {
		const list = prediction.recommendations.slice(0, k);
		const predictionPopularity = prediction.popularity ?? popularity;
		const predictionSimilarity = prediction.similarity ?? similarity;
		const rank = list.indexOf(prediction.target);
		if (rank >= 0) {
			hits++;
			ndcg += 1 / Math.log2(rank + 2);
			reciprocalRank += 1 / (rank + 1);
		}
		const negatives = new Set(prediction.negativeKeys);
		for (const key of list) {
			recommendationCount++;
			uniqueRecommendations.add(key);
			noveltySum += 1 - (predictionPopularity.get(key) ?? 0);
			if (negatives.has(key)) exactNegativeExposures++;
			if (
				prediction.negativeKeys.some(
					(negative) =>
						negative === key ||
						predictionSimilarity(negative, key) >= negativeThreshold,
				)
			)
				similarNegativeExposures++;
		}
		for (let i = 0; i < list.length; i++) {
			for (let j = i + 1; j < list.length; j++) {
				const a = list[i];
				const b = list[j];
				if (!a || !b) continue;
				diversitySum += 1 - predictionSimilarity(a, b);
				diversityPairs++;
			}
		}
	}

	const cases = predictions.length;
	return {
		cases,
		recallAtK: cases === 0 ? 0 : hits / cases,
		ndcgAtK: cases === 0 ? 0 : ndcg / cases,
		mrrAtK: cases === 0 ? 0 : reciprocalRank / cases,
		averageListLength: cases === 0 ? 0 : recommendationCount / cases,
		catalogCoverage:
			catalogSize === 0 ? 0 : uniqueRecommendations.size / catalogSize,
		novelty: recommendationCount === 0 ? 0 : noveltySum / recommendationCount,
		intraListDiversity:
			diversityPairs === 0 ? 0 : diversitySum / diversityPairs,
		exactNegativeExposureRate:
			recommendationCount === 0
				? 0
				: exactNegativeExposures / recommendationCount,
		similarNegativeExposureRate:
			recommendationCount === 0
				? 0
				: similarNegativeExposures / recommendationCount,
	};
}

export function evaluateOfflinePredictions(
	predictions: OfflinePrediction[],
	context: OfflineEvaluationContext,
): OfflineEvaluationReport {
	const segmentNames = new Set(
		predictions.flatMap((prediction) => prediction.segments ?? []),
	);
	return {
		k: context.k,
		overall: summarize(predictions, context),
		segments: Object.fromEntries(
			[...segmentNames].sort().map((segment) => [
				segment,
				summarize(
					predictions.filter((prediction) =>
						prediction.segments?.includes(segment),
					),
					context,
				),
			]),
		),
	};
}

export interface HistoricalCaseResult {
	userId: string;
	ordinal: number;
	target: WorkKey;
	targetAtMs: number;
	rank: number | null;
	negativeCount: number;
}

export interface HistoricalEvaluationResult {
	report: OfflineEvaluationReport;
	popularityBaseline: OfflineEvaluationReport;
	cases: HistoricalCaseResult[];
	availableCases: number;
}

function languageSegment(languageCode: string | null): string {
	const language = languageCode?.toLocaleLowerCase().split(/[-_]/)[0];
	if (language === "ja" || language === "zh" || language === "ko")
		return "language:cjk";
	return language ? "language:other" : "language:unknown";
}

const SESSION_SEED_SIGNALS = new Set([
	"like",
	"completed",
	"progress",
	"progress50",
	"shelf",
]);
const SESSION_SEED_LIMIT = 20;

/**
 * Re-order each mix's items by (frozen score + weight × session boost), exactly
 * as the serving layer's rerankMixRows does — same computeSessionBoost, so the
 * sweep measures production behavior. Seeds are the holdout's recent positive
 * signals; similarities are the per-cutoff pairs. Mutates the mixes in place.
 */
function applySessionRerank(
	mixes: Mix[],
	holdout: RollingTemporalHoldout,
	pairs: ScoredPair[],
	weight: number,
	halfLifeDays?: number,
): void {
	const seeds: SessionSeed[] = holdout.trainingRows
		.filter((row) => SESSION_SEED_SIGNALS.has(row.signal))
		.sort((a, b) => b.atMs - a.atMs)
		.slice(0, SESSION_SEED_LIMIT)
		.map((row) => ({ kind: row.kind, itemId: row.itemId, atMs: row.atMs }));
	if (seeds.length === 0) return;
	const similarities: SeedSimilarity[] = pairs.map((pair) => {
		const seed = parseWorkKey(pair.seed);
		const cand = parseWorkKey(pair.cand);
		return {
			seedKind: seed.kind,
			seedId: seed.id,
			candKind: cand.kind,
			candId: cand.id,
			score: pair.score,
		};
	});
	const boost = computeSessionBoost(
		seeds,
		similarities,
		holdout.targetAtMs,
		halfLifeDays,
	);
	for (const mix of mixes) {
		mix.items = [...mix.items]
			.map((item, rank) => ({ item, rank }))
			.sort(
				(a, b) =>
					b.item.score +
						weight * (boost.get(b.item.key) ?? 0) -
						(a.item.score + weight * (boost.get(a.item.key) ?? 0)) ||
					a.rank - b.rank,
			)
			.map((entry) => entry.item);
	}
}

/**
 * Walk-forward evaluation with behavior-dependent artifacts rebuilt at every
 * cutoff. Metadata and embeddings are a fixed catalog snapshot; popularity,
 * collaborative co-occurrence, exclusions and negative feedback are historical.
 * `sessionWeight` (default 0) applies the serving-time session re-rank so the
 * weight can be calibrated against held-out next reads.
 */
export function evaluateHistoricalWalkForward(
	input: HistoricalEvaluationInput,
): HistoricalEvaluationResult {
	const available = createRollingTemporalHoldouts(
		input.histories,
		input.minPositiveWorks ?? 3,
	);
	const holdouts = deterministicSample(
		available,
		input.maxCases ?? 50,
		input.caseSeed ?? 42,
	);
	const languageByWork = new Map(
		input.baseWorks.map((work) => [
			workKey(work.kind, work.id),
			work.languageCode,
		]),
	);
	const predictions: OfflinePrediction[] = [];
	const popularityPredictions: OfflinePrediction[] = [];
	const cases: HistoricalCaseResult[] = [];

	for (const holdout of holdouts) {
		const works = historicalWorksAt(input.baseWorks, input.histories, holdout);
		const pairs = generateSimilarities(
			works,
			{
				idf: buildIdf(works),
				embeddingCos: input.embeddingSpace
					? embeddingCosOf(input.embeddingSpace)
					: null,
			},
			input.embeddingSpace,
		);
		const mixes = mixesFromHistoricalSnapshot(
			holdout,
			works,
			pairs,
			input.embeddingSpace,
			input.titleKeyByWork,
		);
		if (input.sessionWeight && input.sessionWeight > 0) {
			applySessionRerank(
				mixes,
				holdout,
				pairs,
				input.sessionWeight,
				input.sessionHalfLifeDays,
			);
		}
		const recommendations = mergeMixesForEvaluation(mixes, input.k);
		const popularityEntries = computePopularity(works);
		const popularity = new Map<WorkKey, number>(
			popularityEntries.map((entry) => [
				workKey(entry.kind, entry.id),
				entry.score,
			]),
		);
		const pairScores = new Map(
			pairs.map((pair) => [`${pair.seed}|${pair.cand}`, pair.score]),
		);
		const similarity = (a: WorkKey, b: WorkKey) =>
			Math.max(
				pairScores.get(`${a}|${b}`) ?? 0,
				pairScores.get(`${b}|${a}`) ?? 0,
			);
		predictions.push({
			target: holdout.target,
			recommendations,
			negativeKeys: holdout.negativeKeys,
			segments: [
				`kind:${parseWorkKey(holdout.target).kind}`,
				languageSegment(languageByWork.get(holdout.target) ?? null),
			],
			popularity,
			similarity,
		});
		const baselineExclusions = new Set(
			holdout.trainingRows.map((row) => workKey(row.kind, row.itemId)),
		);
		popularityPredictions.push({
			target: holdout.target,
			recommendations: popularityEntries
				.map((entry) => workKey(entry.kind, entry.id))
				.filter((key) => !baselineExclusions.has(key))
				.slice(0, input.k),
			negativeKeys: holdout.negativeKeys,
			popularity,
			similarity,
		});
		const rank = recommendations.indexOf(holdout.target);
		cases.push({
			userId: holdout.userId,
			ordinal: holdout.ordinal,
			target: holdout.target,
			targetAtMs: holdout.targetAtMs,
			rank: rank < 0 ? null : rank + 1,
			negativeCount: holdout.negativeKeys.length,
		});
	}

	return {
		report: evaluateOfflinePredictions(predictions, {
			k: input.k,
			catalogSize: input.baseWorks.length,
			popularity: new Map(),
			similarity: () => 0,
		}),
		popularityBaseline: evaluateOfflinePredictions(popularityPredictions, {
			k: input.k,
			catalogSize: input.baseWorks.length,
			popularity: new Map(),
			similarity: () => 0,
		}),
		cases,
		availableCases: available.length,
	};
}
