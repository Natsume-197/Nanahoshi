import { workKey } from "./types";

/**
 * Pure session-boost math, shared by the serving-time re-rank
 * (routers/recommendations/rerank.ts) and the offline evaluation harness. Keeps
 * one implementation so a sweep of the weight actually measures what production
 * serves. The weight itself is applied by the caller (serving uses W_SESSION;
 * the eval sweeps it), so this stays weight-agnostic and returns raw boost.
 */

const DAY_MS = 86_400_000;
// A week: recent reading leans the feed, last month barely registers.
export const SESSION_HALF_LIFE_DAYS = 7;

export interface SessionSeed {
	kind: "series" | "book";
	itemId: number;
	atMs: number;
}

export interface SeedSimilarity {
	seedKind: "series" | "book";
	seedId: number;
	candKind: "series" | "book";
	candId: number;
	score: number;
}

/** Exponential recency decay in (0,1]; 1 at age 0, halving every half-life. */
export function recencyDecay(
	ageMs: number,
	halfLifeDays = SESSION_HALF_LIFE_DAYS,
): number {
	if (ageMs <= 0) return 1;
	return 0.5 ** (ageMs / (halfLifeDays * DAY_MS));
}

/**
 * Per-candidate session boost = max over the user's recent seeds of
 * (similarity × seed recency decay). Max (not sum) so a single strongly-related
 * recent read lifts a candidate without many weak seeds stacking into noise.
 */
export function computeSessionBoost(
	seeds: SessionSeed[],
	similarities: SeedSimilarity[],
	nowMs: number,
	halfLifeDays = SESSION_HALF_LIFE_DAYS,
): Map<string, number> {
	const seedDecay = new Map<string, number>();
	for (const s of seeds) {
		seedDecay.set(
			workKey(s.kind, s.itemId),
			recencyDecay(nowMs - s.atMs, halfLifeDays),
		);
	}
	const boost = new Map<string, number>();
	for (const sim of similarities) {
		const decay = seedDecay.get(workKey(sim.seedKind, sim.seedId));
		if (decay === undefined) continue;
		const candKey = workKey(sim.candKind, sim.candId);
		const contrib = sim.score * decay;
		if (contrib > (boost.get(candKey) ?? 0)) boost.set(candKey, contrib);
	}
	return boost;
}
