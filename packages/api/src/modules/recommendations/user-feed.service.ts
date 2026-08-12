import { logger } from "../../lib/logger";
import { isPersonalizedRecommendationsEnabled } from "../../routers/settings/settings.service";
import type { EmbeddingSpace } from "./candidate-generation";
import { EMBEDDING_DIM } from "./candidate-generation";
import { recommendationComputeRepository as repo } from "./recommendation-compute.repository";
import { type SignalRow, type SignalType, selectSeeds } from "./seed-selection";
import { clusterSeeds } from "./taste-clustering";
import type {
	RecommendationReason,
	ScoredPair,
	WorkAggregate,
	WorkKey,
} from "./types";
import { parseWorkKey, workKey } from "./types";
import { buildMixes, type Mix, type SimilarityRow } from "./user-feed";

const log = logger.child({ component: "recommendations-user-feed" });

export interface UserFeedSignalInput {
	kind: "series" | "book";
	itemId: number;
	signal: string;
	atMs: number;
}

/** Immutable catalog data shared by every user computed in one rebuild. */
export interface UserFeedSharedContext {
	popularity: Map<WorkKey, number>;
	popularOrder: WorkKey[];
	popularTitleKeyByWork: Map<WorkKey, string>;
	// Full-catalog data loaded once per rebuild. When present, the per-user
	// similarity/embedding/author/title queries are answered from memory;
	// per-user values are identical (subsets of the same source data).
	catalog?: {
		similaritiesBySeed: Map<WorkKey, SimilarityRow[]>;
		vectors: Map<WorkKey, Float32Array> | null;
		primaryAuthorByWork: Map<WorkKey, number>;
		titleKeyByWork: Map<WorkKey, string>;
	};
}

async function loadPopularityContext(serverId: string): Promise<{
	popularity: Map<WorkKey, number>;
	popularOrder: WorkKey[];
}> {
	const popularityRows = await repo.loadPopularityOrdered(serverId);
	const popularity = new Map<WorkKey, number>();
	const popularOrder: WorkKey[] = [];
	for (const row of popularityRows) {
		const key = workKey(row.kind, row.itemId);
		popularity.set(key, row.score);
		popularOrder.push(key);
	}
	return { popularity, popularOrder };
}

function groupSimilarities(
	rows: {
		seedKind: "series" | "book";
		seedId: number;
		candKind: "series" | "book";
		candId: number;
		score: number;
		components: Record<string, number>;
		reason: string;
	}[],
): Map<WorkKey, SimilarityRow[]> {
	const bySeed = new Map<WorkKey, SimilarityRow[]>();
	for (const r of rows) {
		const seedKey = workKey(r.seedKind, r.seedId);
		let list = bySeed.get(seedKey);
		if (!list) {
			list = [];
			bySeed.set(seedKey, list);
		}
		list.push({
			cand: workKey(r.candKind, r.candId),
			score: r.score,
			components: r.components,
			reason: r.reason as RecommendationReason,
		});
	}
	return bySeed;
}

export async function loadUserFeedSharedContext(
	serverId: string,
	full?: {
		works: WorkAggregate[];
		// fresh in-memory outputs of this rebuild; when absent they are loaded
		// from the tables the rebuild just wrote (identical rows either way)
		pairs?: ScoredPair[];
		space?: EmbeddingSpace | null;
	},
): Promise<UserFeedSharedContext> {
	const { popularity, popularOrder } = await loadPopularityContext(serverId);
	const titles = await repo.loadRecommendationTitleKeys(
		serverId,
		popularOrder.map((key) => parseWorkKey(key)),
	);
	const context: UserFeedSharedContext = {
		popularity,
		popularOrder,
		popularTitleKeyByWork: new Map<WorkKey, string>([...titles.entries()] as [
			WorkKey,
			string,
		][]),
	};
	if (!full) return context;

	const workKeys = full.works.map((w) => ({ kind: w.kind, id: w.id }));

	let similaritiesBySeed: Map<WorkKey, SimilarityRow[]>;
	if (full.pairs) {
		similaritiesBySeed = new Map();
		for (const p of full.pairs) {
			let list = similaritiesBySeed.get(p.seed);
			if (!list) {
				list = [];
				similaritiesBySeed.set(p.seed, list);
			}
			list.push({
				cand: p.cand,
				score: p.score,
				components: p.components,
				reason: p.reason,
			});
		}
		// same order the per-seed SQL load yields (score DESC per seed)
		for (const list of similaritiesBySeed.values())
			list.sort((a, b) => b.score - a.score || (a.cand < b.cand ? -1 : 1));
	} else {
		similaritiesBySeed = groupSimilarities(
			await repo.loadAllSimilarities(serverId),
		);
	}

	let vectors: Map<WorkKey, Float32Array> | null = null;
	if (full.space) {
		vectors = new Map();
		for (let i = 0; i < full.space.keys.length; i++) {
			const key = full.space.keys[i];
			if (key === undefined) continue;
			vectors.set(
				key,
				full.space.vectors.slice(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM),
			);
		}
	} else if (full.space === undefined) {
		const rows = await repo.loadEmbeddings(serverId);
		vectors =
			rows.length > 0
				? new Map(
						rows.map((r) => [
							workKey(r.kind, r.itemId),
							Float32Array.from(r.vector),
						]),
					)
				: null;
	}
	if (vectors && vectors.size === 0) vectors = null;

	context.catalog = {
		similaritiesBySeed,
		vectors,
		primaryAuthorByWork: new Map<WorkKey, number>([
			...(await repo.loadPrimaryAuthors(serverId, workKeys)).entries(),
		] as [WorkKey, number][]),
		titleKeyByWork: new Map<WorkKey, string>([
			...(await repo.loadRecommendationTitleKeys(serverId, workKeys)).entries(),
		] as [WorkKey, string][]),
	};
	return context;
}

/**
 * Builds a feed from an explicit signal snapshot without persisting it.
 * Production recomputes and offline temporal evaluation share this exact path.
 */
export async function buildUserMixesPreview(
	serverId: string,
	signalRows: UserFeedSignalInput[],
	nowMs = Date.now(),
	sharedContext?: UserFeedSharedContext,
): Promise<Mix[]> {
	const rows: SignalRow[] = signalRows.map((r) => ({
		key: workKey(r.kind, r.itemId),
		signal: r.signal as SignalType,
		atMs: r.atMs,
	}));
	const { seeds, negativeSeeds, exclusions } = selectSeeds(rows, nowMs);
	const catalog = sharedContext?.catalog;

	let similaritiesBySeed: Map<WorkKey, SimilarityRow[]>;
	if (catalog) {
		similaritiesBySeed = new Map();
		for (const s of [...seeds, ...negativeSeeds]) {
			const list = catalog.similaritiesBySeed.get(s.key);
			if (list) similaritiesBySeed.set(s.key, list);
		}
	} else {
		// one query for positive + negative seeds; split by membership afterwards
		const simRows = await repo.loadSimilaritiesForSeeds(
			serverId,
			[...seeds, ...negativeSeeds].map((s) => parseWorkKey(s.key)),
		);
		similaritiesBySeed = groupSimilarities(simRows);
	}

	// seeds that appear in each other's top-K → connectivity fallback clustering
	// (positive → positive only; negative seeds never drive clustering)
	const similarSeedPairs = new Set<string>();
	const seedKeySet = new Set(seeds.map((s) => s.key));
	for (const [seedKey, list] of similaritiesBySeed) {
		if (!seedKeySet.has(seedKey)) continue;
		for (const row of list) {
			if (seedKeySet.has(row.cand))
				similarSeedPairs.add(`${seedKey}|${row.cand}`);
		}
	}

	const negatives = negativeSeeds.map((seed) => ({
		seed,
		sims: similaritiesBySeed.get(seed.key) ?? [],
	}));

	const catalogContext = sharedContext ?? {
		...(await loadPopularityContext(serverId)),
		popularTitleKeyByWork: new Map<WorkKey, string>(),
	};
	const { popularity, popularOrder } = catalogContext;

	// embeddings only for seeds + candidate pool (bounded, never the catalog)
	const poolKeys = new Set<WorkKey>(seeds.map((s) => s.key));
	for (const list of similaritiesBySeed.values())
		for (const r of list) poolKeys.add(r.cand);

	// per-user maps are built as pool-scoped subsets of the shared catalog so
	// null-ness/coverage semantics match the per-user DB loads exactly
	let vectors: Map<WorkKey, Float32Array> | null;
	let primaryAuthorByWork: Map<WorkKey, number>;
	const titleKeyByWork = new Map<WorkKey, string>(
		catalogContext.popularTitleKeyByWork,
	);
	if (catalog) {
		const subset = new Map<WorkKey, Float32Array>();
		if (catalog.vectors) {
			for (const key of poolKeys) {
				const v = catalog.vectors.get(key);
				if (v) subset.set(key, v);
			}
		}
		vectors = subset.size > 0 ? subset : null;
		primaryAuthorByWork = catalog.primaryAuthorByWork;
		for (const key of poolKeys) {
			const title = catalog.titleKeyByWork.get(key);
			if (title !== undefined) titleKeyByWork.set(key, title);
		}
	} else {
		const embeddingRows = await repo.loadEmbeddingsByKeys(
			serverId,
			[...poolKeys].map((k) => parseWorkKey(k)),
		);
		vectors =
			embeddingRows.length > 0
				? new Map(
						embeddingRows.map((r) => [
							workKey(r.kind, r.itemId),
							Float32Array.from(r.vector),
						]),
					)
				: null;

		const primaryAuthorRows = await repo.loadPrimaryAuthors(
			serverId,
			[...poolKeys].map((k) => parseWorkKey(k)),
		);
		primaryAuthorByWork = new Map<WorkKey, number>([
			...primaryAuthorRows.entries(),
		] as [WorkKey, number][]);
		const requestedTitleKeys = sharedContext
			? [...poolKeys]
			: [...new Set([...poolKeys, ...popularOrder])];
		const loadedTitleKeys = await repo.loadRecommendationTitleKeys(
			serverId,
			requestedTitleKeys.map((key) => parseWorkKey(key)),
		);
		for (const [key, title] of loadedTitleKeys)
			titleKeyByWork.set(key as WorkKey, title);
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
		negatives,
	});
}

export async function computeUserFeed(
	serverId: string,
	userId: string,
	options: {
		skipIfUnchanged?: boolean;
		sharedContext?: UserFeedSharedContext;
		// batch-loaded by the rebuild loop; single-user callers omit it
		preloaded?: { signalsFp: string; signalRows: UserFeedSignalInput[] };
	} = {},
): Promise<{ mixes: number } | { skipped: true; reason: string }> {
	const signalsFp =
		options.preloaded?.signalsFp ??
		(await repo.computeUserSignalsFingerprint(serverId, userId));
	if (options.skipIfUnchanged) {
		const stored = await repo.getUserRecState(serverId, userId);
		if (stored === signalsFp) return { skipped: true, reason: "unchanged" };
	}

	const signalRows =
		options.preloaded?.signalRows ??
		(await repo.loadUserSignalWorks(serverId, userId));
	const mixes = await buildUserMixesPreview(
		serverId,
		signalRows,
		Date.now(),
		options.sharedContext,
	);

	await repo.replaceUserRecommendations(
		serverId,
		userId,
		mixes.map((m) => ({
			mixIndex: m.mixIndex,
			anchorKind: m.anchor ? parseWorkKey(m.anchor).kind : null,
			anchorId: m.anchor ? parseWorkKey(m.anchor).id : null,
			items: m.items.map((it) => {
				const cand = parseWorkKey(it.key);
				const reasonRef = it.reasonKey ? parseWorkKey(it.reasonKey) : null;
				return {
					kind: cand.kind,
					itemId: cand.id,
					score: Math.min(1, Math.max(0, it.score)),
					rank: it.rank,
					reason: it.reason,
					reasonKind: reasonRef?.kind ?? null,
					reasonId: reasonRef?.id ?? null,
					components: it.components,
				};
			}),
		})),
		signalsFp,
	);

	return { mixes: mixes.length };
}

/**
 * Debounced per-user refresh. Dirty-check: if the user's signals moved while
 * we were computing, run once more so late events are never lost.
 */
export async function refreshUser(
	serverId: string,
	userId: string,
): Promise<{ mixes: number } | { skipped: true; reason: string }> {
	if (!(await isPersonalizedRecommendationsEnabled(serverId))) {
		return { skipped: true, reason: "disabled" };
	}
	const before = await repo.computeUserSignalsFingerprint(serverId, userId);
	const result = await computeUserFeed(serverId, userId);
	const after = await repo.computeUserSignalsFingerprint(serverId, userId);
	if (after !== before) {
		log.info(
			{ serverId, userId },
			"Signals changed mid-refresh, running again",
		);
		return await computeUserFeed(serverId, userId);
	}
	return result;
}
