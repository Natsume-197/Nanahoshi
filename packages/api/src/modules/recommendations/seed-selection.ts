import type { WorkKey } from "./types";

export type SignalType =
	| "like"
	| "completed"
	| "progress50"
	| "progress"
	| "shelf"
	| "abandoned"
	| "not_interested";

export interface SignalRow {
	key: WorkKey;
	signal: SignalType;
	atMs: number;
}

export interface Seed {
	key: WorkKey;
	weight: number;
	fromLike: boolean;
}

export interface NegativeSeed {
	key: WorkKey;
	weight: number;
	type: "abandoned" | "not_interested";
}

const SIGNAL_WEIGHTS: Partial<Record<SignalType, number>> = {
	like: 1.0,
	completed: 0.8,
	progress50: 0.6,
	progress: 0, // exclusion only — already reading it
	shelf: 0.3,
};

// Negative signals penalize similar candidates (never seed positive taste).
// not_interested is explicit and stronger; abandoned is a weak implicit signal.
const NEG_SIGNAL_WEIGHTS: Record<NegativeSeed["type"], number> = {
	not_interested: 0.7,
	abandoned: 0.3,
};

const RECENCY_HALF_LIFE_DAYS = 90;
// Negatives fade slower than positives so a rejection keeps effect for a while.
const NEG_RECENCY_HALF_LIFE_DAYS = 180;
export const MAX_SEEDS = 20;
export const MAX_NEGATIVE_SEEDS = 20;

function isNegative(signal: SignalType): signal is NegativeSeed["type"] {
	return signal === "abandoned" || signal === "not_interested";
}

export function selectSeeds(
	rows: SignalRow[],
	nowMs: number,
): { seeds: Seed[]; negativeSeeds: NegativeSeed[]; exclusions: Set<WorkKey> } {
	const exclusions = new Set<WorkKey>();
	const byWork = new Map<WorkKey, { weight: number; fromLike: boolean }>();
	const negByWork = new Map<WorkKey, NegativeSeed>();

	for (const row of rows) {
		exclusions.add(row.key);
		const ageDays = Math.max(0, (nowMs - row.atMs) / 86_400_000);

		if (isNegative(row.signal)) {
			const weight =
				NEG_SIGNAL_WEIGHTS[row.signal] *
				Math.exp(-ageDays / NEG_RECENCY_HALF_LIFE_DAYS);
			const prev = negByWork.get(row.key);
			if (!prev || weight > prev.weight)
				negByWork.set(row.key, { key: row.key, weight, type: row.signal });
			continue;
		}

		const base = SIGNAL_WEIGHTS[row.signal] ?? 0;
		if (base === 0) continue;
		const weight = base * Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS);
		const prev = byWork.get(row.key);
		if (!prev || weight > prev.weight) {
			byWork.set(row.key, {
				weight,
				fromLike: row.signal === "like" || (prev?.fromLike ?? false),
			});
		} else if (row.signal === "like") {
			prev.fromLike = true;
		}
	}

	// an explicit rejection / abandonment overrides positive taste for that work
	for (const key of negByWork.keys()) byWork.delete(key);

	const seeds = [...byWork.entries()]
		.map(([key, v]) => ({ key, weight: v.weight, fromLike: v.fromLike }))
		.sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : 1))
		.slice(0, MAX_SEEDS);

	const negativeSeeds = [...negByWork.values()]
		.sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : 1))
		.slice(0, MAX_NEGATIVE_SEEDS);

	return { seeds, negativeSeeds, exclusions };
}
