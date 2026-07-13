import { logger } from "../../lib/logger";
import { isRecommendationsEnabled } from "../../routers/settings/settings.service";
import { recommendationComputeRepository as repo } from "./recommendation-compute.repository";
import { type SignalRow, type SignalType, selectSeeds } from "./seed-selection";
import { clusterSeeds } from "./taste-clustering";
import type { RecommendationReason, WorkKey } from "./types";
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

export async function loadUserFeedSharedContext(
	serverId: string,
): Promise<UserFeedSharedContext> {
	const { popularity, popularOrder } = await loadPopularityContext(serverId);
	const titles = await repo.loadRecommendationTitleKeys(
		serverId,
		popularOrder.map((key) => parseWorkKey(key)),
	);
	return {
		popularity,
		popularOrder,
		popularTitleKeyByWork: new Map<WorkKey, string>([...titles.entries()] as [
			WorkKey,
			string,
		][]),
	};
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

	// one query for positive + negative seeds; split by membership afterwards
	const simRows = await repo.loadSimilaritiesForSeeds(
		serverId,
		[...seeds, ...negativeSeeds].map((s) => parseWorkKey(s.key)),
	);
	const similaritiesBySeed = new Map<WorkKey, SimilarityRow[]>();
	for (const r of simRows) {
		const seedKey = workKey(r.seedKind, r.seedId);
		let list = similaritiesBySeed.get(seedKey);
		if (!list) {
			list = [];
			similaritiesBySeed.set(seedKey, list);
		}
		list.push({
			cand: workKey(r.candKind, r.candId),
			score: r.score,
			components: r.components,
			reason: r.reason as RecommendationReason,
		});
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
	const embeddingRows = await repo.loadEmbeddingsByKeys(
		serverId,
		[...poolKeys].map((k) => parseWorkKey(k)),
	);
	const vectors =
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
	const primaryAuthorByWork = new Map<WorkKey, number>([
		...primaryAuthorRows.entries(),
	] as [WorkKey, number][]);
	const requestedTitleKeys = sharedContext
		? [...poolKeys]
		: [...new Set([...poolKeys, ...popularOrder])];
	const loadedTitleKeys = await repo.loadRecommendationTitleKeys(
		serverId,
		requestedTitleKeys.map((key) => parseWorkKey(key)),
	);
	const titleKeyByWork = new Map<WorkKey, string>(
		catalogContext.popularTitleKeyByWork,
	);
	for (const [key, title] of loadedTitleKeys)
		titleKeyByWork.set(key as WorkKey, title);

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
	} = {},
): Promise<{ mixes: number } | { skipped: true; reason: string }> {
	const signalsFp = await repo.computeUserSignalsFingerprint(serverId, userId);
	if (options.skipIfUnchanged) {
		const stored = await repo.getUserRecState(serverId, userId);
		if (stored === signalsFp) return { skipped: true, reason: "unchanged" };
	}

	const signalRows = await repo.loadUserSignalWorks(serverId, userId);
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
	if (!(await isRecommendationsEnabled(serverId))) {
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
