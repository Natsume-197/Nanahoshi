import {
	computeSessionBoost,
	recencyDecay,
} from "../../modules/recommendations/session-boost";
import type { ImpressionEntry } from "./impression.store";
import type { RepresentativeRow } from "./recommendations.repository";

export type {
	SeedSimilarity,
	SessionSeed,
} from "../../modules/recommendations/session-boost";
// Re-exported so the serving layer and its tests keep a single import surface;
// the math itself lives in the shared session-boost module (also used by the
// offline evaluation harness, so a weight sweep measures what production serves).
export { computeSessionBoost, recencyDecay };

/**
 * Online re-ranking of an already-materialized, permission-filtered candidate
 * pool. The heavy work (retrieval, taste clustering) is offline; this applies
 * cheap, live signals the last batch didn't know about — O(pool), pure, no I/O.
 */
export interface ServingContext {
	/** Work keys the user explicitly dismissed, still within the refresh debounce. */
	dismissed: Set<string>;
	/**
	 * Candidate work key → recency-decayed similarity to the user's recent
	 * engagement, in [0,1]. Added (scaled by W_SESSION) to the frozen batch score
	 * so a mix leans toward what the user has been reading lately.
	 */
	sessionBoost: Map<string, number>;
	/**
	 * Work key → how often it was already shown to this user (session-spaced).
	 * Optional: flat endpoints and tests without impression data skip the
	 * rotation penalty entirely.
	 */
	impressions?: Map<string, ImpressionEntry>;
}

export const emptyServingContext = (): ServingContext => ({
	dismissed: new Set(),
	sessionBoost: new Map(),
});

// Bounded nudge on top of the frozen score. Calibrated via the offline
// evaluation sweep (see offline-evaluation.test.ts) — large enough to reorder
// near-ties, too small to bury a strong batch pick.
const W_SESSION = 0.08;

// Rotation: each session-spaced impression without engagement demotes a row a
// little further, saturating at IMPRESSION_CAP. Max penalty (0.12) outweighs a
// full session boost so a stale row eventually yields its slot to the next
// candidate in the over-fetched pool, but it can never bury a clear best pick
// under a much weaker one.
const W_IMPRESSION = 0.12;
export const IMPRESSION_CAP = 8;

/** Frozen batch score plus the bounded session nudge, minus staleness. */
function adjustedScore(row: RepresentativeRow, ctx: ServingContext): number {
	const key = workKey(row.kind, row.itemId);
	const boost = ctx.sessionBoost.get(key) ?? 0;
	const seen = ctx.impressions?.get(key)?.count ?? 0;
	const penalty =
		(W_IMPRESSION * Math.min(seen, IMPRESSION_CAP)) / IMPRESSION_CAP;
	return Number(row.score) + W_SESSION * boost - penalty;
}

/** Stable `${kind}:${itemId}` key for a work. */
export function workKey(
	kind: "series" | "book",
	itemId: string | number,
): string {
	return `${kind}:${itemId}`;
}

/**
 * A row is suppressed when the exact volume being shown is already completed
 * (the representative LATERAL advances to the next unread volume, so this only
 * fires when the whole work is finished), or the work was just dismissed. Both
 * are freshness fixes for the window between a user action and the next batch.
 */
export function isSuppressed(
	row: RepresentativeRow,
	ctx: ServingContext,
): boolean {
	if (row.representativeCompleted) return true;
	return ctx.dismissed.has(workKey(row.kind, row.itemId));
}

/**
 * Within each mix: drop suppressed rows, re-order by adjusted score (frozen
 * score + session boost), then cap to `perMixLimit`. Ties break by the batch's
 * original rank, so with an empty context the batch order is reproduced exactly
 * — deterministic given the same context, so passive reloads stay stable and
 * only a user action changes the result.
 */
export function rerankMixRows(
	rows: RepresentativeRow[],
	ctx: ServingContext,
	perMixLimit: number,
): RepresentativeRow[] {
	const byMix = new Map<number, RepresentativeRow[]>();
	for (const row of rows) {
		if (isSuppressed(row, ctx)) continue;
		const mixIndex = row.mixIndex ?? 0;
		let bucket = byMix.get(mixIndex);
		if (!bucket) {
			bucket = [];
			byMix.set(mixIndex, bucket);
		}
		bucket.push(row);
	}
	const out: RepresentativeRow[] = [];
	for (const bucket of byMix.values()) {
		bucket.sort(
			(a, b) =>
				adjustedScore(b, ctx) - adjustedScore(a, ctx) ||
				(a.rank ?? 0) - (b.rank ?? 0),
		);
		for (const row of bucket.slice(0, perMixLimit)) out.push(row);
	}
	return out;
}

/** Flat-list variant for similar/popular endpoints: drop suppressed, cap to limit. */
export function filterFlatRows(
	rows: RepresentativeRow[],
	ctx: ServingContext,
	limit: number,
): RepresentativeRow[] {
	const out: RepresentativeRow[] = [];
	for (const row of rows) {
		if (isSuppressed(row, ctx)) continue;
		out.push(row);
		if (out.length >= limit) break;
	}
	return out;
}
