import { embeddingSimilarity } from "./scorer";
import type { NegativeSeed, Seed } from "./seed-selection";
import type { TasteCluster } from "./taste-clustering";
import { recommendationTitlesEquivalent } from "./title-dedup";
import type { RecommendationReason, WorkKey } from "./types";

export interface SimilarityRow {
	cand: WorkKey;
	score: number;
	components: Record<string, number>;
	reason: RecommendationReason;
}

export interface MixItem {
	key: WorkKey;
	score: number;
	rank: number;
	reason: RecommendationReason;
	reasonKey: WorkKey | null;
	components: Record<string, number>;
}

export interface Mix {
	mixIndex: number;
	anchor: WorkKey | null;
	items: MixItem[];
}

export const ITEMS_PER_MIX = 20;
const MAX_PER_REASON = 3;
const MAX_PER_AUTHOR = 4;
const EXPLORATION_SLOTS = 2;

// Similarity dominates: for a taste/like-anchored mix the explicit signal is
// what the user chose, so content match must win. Popularity stays a gentle
// tiebreaker among near-equal candidates — at a higher weight a mega-franchise
// (many volumes, broad engagement) overrides a clearly closer but niche work.
const W_SIM = 0.9;
const W_POP = 0.05;
const W_EXPLORE = 0.05;
const W_CENTROID = 0.1;

interface Candidate {
	key: WorkKey;
	simScore: number; // Σ seedWeight·sim
	contributingWeight: number;
	bestSeed: Seed;
	bestReason: RecommendationReason;
	components: Record<string, number>;
	final: number;
	explore: number;
}

export interface BuildMixesInput {
	clusters: TasteCluster[];
	similaritiesBySeed: Map<WorkKey, SimilarityRow[]>;
	popularity: Map<WorkKey, number>;
	popularOrder: WorkKey[]; // popularity-desc, deterministic
	exclusions: Set<WorkKey>;
	vectors: Map<WorkKey, Float32Array> | null;
	primaryAuthorByWork: Map<WorkKey, number> | null;
	titleKeyByWork?: Map<WorkKey, string>;
	// negative seeds + their precomputed similarity to candidates
	negatives?: { seed: NegativeSeed; sims: SimilarityRow[] }[];
}

// Penalty from the single strongest negative pull (MAX, not SUM): stacking many
// negatives of the same series can't bury a candidate beyond one rejection —
// "a dislike shouldn't ban the artist". Bounded by the strongest negWeight.
function buildPenaltyByCandidate(
	negatives: BuildMixesInput["negatives"],
): Map<WorkKey, number> {
	const penalty = new Map<WorkKey, number>();
	for (const { seed, sims } of negatives ?? []) {
		for (const row of sims) {
			const pen = seed.weight * row.score;
			if (pen > (penalty.get(row.cand) ?? 0)) penalty.set(row.cand, pen);
		}
	}
	return penalty;
}

function centroidBonus(
	centroid: Float32Array | null,
	vectors: Map<WorkKey, Float32Array> | null,
	key: WorkKey,
): number {
	if (!centroid || !vectors) return 0;
	const v = vectors.get(key);
	if (!v) return 0;
	let dot = 0;
	for (let d = 0; d < centroid.length; d++)
		dot += (centroid[d] ?? 0) * (v[d] ?? 0);
	return embeddingSimilarity(dot);
}

function clusterCandidates(
	cluster: TasteCluster,
	input: BuildMixesInput,
	penaltyByCandidate: Map<WorkKey, number>,
): Candidate[] {
	const byKey = new Map<WorkKey, Candidate>();
	const excludedTitles = [...input.exclusions]
		.map((key) => input.titleKeyByWork?.get(key))
		.filter((key): key is string => Boolean(key));
	for (const seed of cluster.seeds) {
		for (const row of input.similaritiesBySeed.get(seed.key) ?? []) {
			if (input.exclusions.has(row.cand)) continue;
			const candidateTitle = input.titleKeyByWork?.get(row.cand);
			if (
				candidateTitle &&
				excludedTitles.some((title) =>
					recommendationTitlesEquivalent(candidateTitle, title),
				)
			)
				continue;
			const contribution = seed.weight * row.score;
			let cand = byKey.get(row.cand);
			if (!cand) {
				cand = {
					key: row.cand,
					simScore: 0,
					contributingWeight: 0,
					bestSeed: seed,
					bestReason: row.reason,
					components: row.components,
					final: 0,
					explore: 0,
				};
				byKey.set(row.cand, cand);
			}
			cand.simScore += contribution;
			cand.contributingWeight += seed.weight;
			const bestContribution =
				cand.bestSeed.weight *
				(input.similaritiesBySeed
					.get(cand.bestSeed.key)
					?.find((r) => r.cand === row.cand)?.score ?? 0);
			if (contribution > bestContribution) {
				cand.bestSeed = seed;
				cand.bestReason = row.reason;
				cand.components = row.components;
			}
		}
	}

	const candidates = [...byKey.values()];
	for (const c of candidates) {
		const calibratedSim = c.simScore / Math.max(c.contributingWeight, 1e-9);
		const pop = input.popularity.get(c.key) ?? 0;
		const penalty = penaltyByCandidate.get(c.key) ?? 0;
		// exploration also feels the penalty so a rejected niche work can't sneak
		// back in through the reserved exploration slots
		const explore = Math.max(0, calibratedSim * (1 - pop) - penalty);
		const bonus =
			W_CENTROID * centroidBonus(cluster.centroid, input.vectors, c.key);
		c.explore = explore;
		c.final = Math.min(
			1,
			Math.max(
				0,
				W_SIM * calibratedSim +
					W_POP * pop +
					W_EXPLORE * explore +
					bonus -
					penalty,
			),
		);
	}
	candidates.sort((a, b) => b.final - a.final || (a.key < b.key ? -1 : 1));
	return candidates;
}

function applyDiversity(
	candidates: Candidate[],
	input: BuildMixesInput,
	limit: number,
	seedCount: number,
): Candidate[] {
	const picked: Candidate[] = [];
	const perReason = new Map<WorkKey, number>();
	const perAuthor = new Map<number, number>();
	const skipped: Candidate[] = [];
	const pickedTitles: string[] = [];
	// a single-seed cluster legitimately fills its mix from that one seed;
	// the cap only prevents one seed from flooding a multi-seed mix
	const reasonCap = Math.max(
		MAX_PER_REASON,
		Math.ceil(limit / Math.max(1, seedCount)),
	);

	for (const c of candidates) {
		const titleKey = input.titleKeyByWork?.get(c.key);
		if (
			titleKey &&
			pickedTitles.some((picked) =>
				recommendationTitlesEquivalent(titleKey, picked),
			)
		)
			continue;
		if (picked.length >= limit - EXPLORATION_SLOTS) {
			skipped.push(c);
			continue;
		}
		const reasonKey = c.bestSeed.key;
		const author = input.primaryAuthorByWork?.get(c.key);
		if ((perReason.get(reasonKey) ?? 0) >= reasonCap) {
			skipped.push(c);
			continue;
		}
		if (
			author !== undefined &&
			(perAuthor.get(author) ?? 0) >= MAX_PER_AUTHOR
		) {
			skipped.push(c);
			continue;
		}
		picked.push(c);
		if (titleKey) pickedTitles.push(titleKey);
		perReason.set(reasonKey, (perReason.get(reasonKey) ?? 0) + 1);
		if (author !== undefined)
			perAuthor.set(author, (perAuthor.get(author) ?? 0) + 1);
	}

	// last slots favor under-popular but well-connected works; they bypass
	// diversity on purpose but never exceed their reserved count
	const exploreLimit = Math.min(
		EXPLORATION_SLOTS,
		Math.max(0, limit - picked.length),
	);
	const explorePool: Candidate[] = [];
	const explorationTitles = [...pickedTitles];
	for (const candidate of skipped.sort(
		(a, b) => b.explore - a.explore || (a.key < b.key ? -1 : 1),
	)) {
		const titleKey = input.titleKeyByWork?.get(candidate.key);
		if (
			titleKey &&
			explorationTitles.some((picked) =>
				recommendationTitlesEquivalent(titleKey, picked),
			)
		)
			continue;
		explorePool.push(candidate);
		if (titleKey) explorationTitles.push(titleKey);
		if (explorePool.length >= exploreLimit) break;
	}
	return [...picked, ...explorePool];
}

export function buildMixes(input: BuildMixesInput): Mix[] {
	const mixes: Mix[] = [];
	const assigned: {
		candidate: WorkKey;
		titleKey: string;
		mix: number;
		final: number;
	}[] = [];
	const penaltyByCandidate = buildPenaltyByCandidate(input.negatives);
	const perMixCandidates: Candidate[][] = input.clusters.map((cluster) =>
		clusterCandidates(cluster, input, penaltyByCandidate),
	);

	// Cross-mix dedup: equivalent titles go where their best variant scores highest.
	for (let m = 0; m < perMixCandidates.length; m++) {
		for (const c of perMixCandidates[m] ?? []) {
			const titleKey = input.titleKeyByWork?.get(c.key) ?? c.key;
			const prev = assigned.find((entry) =>
				recommendationTitlesEquivalent(entry.titleKey, titleKey),
			);
			if (!prev) {
				assigned.push({ candidate: c.key, titleKey, mix: m, final: c.final });
			} else if (c.final > prev.final) {
				Object.assign(prev, {
					candidate: c.key,
					titleKey,
					mix: m,
					final: c.final,
				});
			}
		}
	}

	for (let m = 0; m < input.clusters.length; m++) {
		const cluster = input.clusters[m];
		if (!cluster) continue;
		const owned = (perMixCandidates[m] ?? []).filter((c) =>
			assigned.some((entry) => entry.candidate === c.key && entry.mix === m),
		);
		const items = applyDiversity(
			owned,
			input,
			ITEMS_PER_MIX,
			cluster.seeds.length,
		);
		if (items.length === 0) continue;
		mixes.push({
			mixIndex: mixes.length,
			anchor: cluster.anchor.key,
			items: items.map((c, rank) => ({
				key: c.key,
				score: c.final,
				rank,
				reason: c.bestSeed.fromLike ? "because_you_liked" : c.bestReason,
				reasonKey: c.bestSeed.key,
				components: c.components,
			})),
		});
	}

	if (mixes.length === 0) {
		const eligible = input.popularOrder.filter(
			(key) => !input.exclusions.has(key),
		);
		const withSignals = eligible.filter(
			(key) => (input.popularity.get(key) ?? 0) > 0,
		);
		const source = withSignals.length > 0 ? withSignals : eligible;
		const selected: WorkKey[] = [];
		const selectedTitles: string[] = [];
		for (const key of source) {
			const titleKey = input.titleKeyByWork?.get(key);
			if (
				titleKey &&
				selectedTitles.some((picked) =>
					recommendationTitlesEquivalent(titleKey, picked),
				)
			)
				continue;
			selected.push(key);
			if (titleKey) selectedTitles.push(titleKey);
			if (selected.length >= ITEMS_PER_MIX) break;
		}
		const items = selected.map((key, rank) => ({
			key,
			score: input.popularity.get(key) ?? 0,
			rank,
			reason: "popular" as const,
			reasonKey: null,
			components: {},
		}));
		if (items.length > 0) mixes.push({ mixIndex: 0, anchor: null, items });
	}

	return mixes;
}
