import { buildIvfIndex, searchExact, searchIvfIndex } from "./ivf-index";
import type { ScoreContext } from "./scorer";
import { buildWorkScoringIndex, similarityIndexed } from "./scorer";
import type { ScoredPair, WorkAggregate, WorkKey } from "./types";
import { workKey } from "./types";

// Terms shared by more works than this generate no pairs (they'd blow up
// pair count and carry near-zero IDF) — they still score generated pairs.
export const TERM_DF_CAP = 200;
export const TERM_DF_MAX_RATIO = 0.25;
export const TOP_K_PER_SEED = 30;
// Above this, exact kNN is replaced by IVF; above SEMANTIC_MAX_WORKS no
// embedding-sourced candidates are generated at all (embedding still scores).
export const EXACT_KNN_MAX_WORKS = 5000;
export const SEMANTIC_MAX_WORKS = 150_000;
const SEMANTIC_NEIGHBORS = 20;
export const EMBEDDING_DIM = 384;

export interface EmbeddingSpace {
	vectors: Float32Array;
	indexOf: Map<WorkKey, number>;
	keys: WorkKey[];
}

export function buildEmbeddingSpace(
	entries: { key: WorkKey; vector: Float32Array | number[] }[],
): EmbeddingSpace {
	const vectors = new Float32Array(entries.length * EMBEDDING_DIM);
	const indexOf = new Map<WorkKey, number>();
	const keys: WorkKey[] = [];
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (!entry) continue;
		vectors.set(entry.vector, i * EMBEDDING_DIM);
		indexOf.set(entry.key, i);
		keys.push(entry.key);
	}
	return { vectors, indexOf, keys };
}

export function embeddingCosOf(space: EmbeddingSpace) {
	return (a: WorkKey, b: WorkKey): number | null => {
		const ia = space.indexOf.get(a);
		const ib = space.indexOf.get(b);
		if (ia === undefined || ib === undefined) return null;
		let s = 0;
		const ao = ia * EMBEDDING_DIM;
		const bo = ib * EMBEDDING_DIM;
		for (let d = 0; d < EMBEDDING_DIM; d++)
			s +=
				(space.vectors[ao + d] as number) * (space.vectors[bo + d] as number);
		return s;
	};
}

function* invertedIndexPairs(
	works: WorkAggregate[],
): Generator<[number, number]> {
	const termLists = new Map<string, number[]>();
	const add = (term: string, i: number) => {
		let list = termLists.get(term);
		if (!list) {
			list = [];
			termLists.set(term, list);
		}
		list.push(i);
	};
	for (let i = 0; i < works.length; i++) {
		const w = works[i];
		if (!w) continue;
		for (const a of w.authorIds) add(`a:${a}`, i);
		for (const g of w.genreIds) add(`g:${g}`, i);
		for (const t of w.tagIds) add(`t:${t}`, i);
		for (const p of w.publisherIds) add(`p:${p}`, i);
		for (const u of w.engagedUserIds) add(`u:${u}`, i);
	}
	for (const [term, list] of termLists) {
		const relativeCap = Math.max(
			10,
			Math.floor(works.length * TERM_DF_MAX_RATIO),
		);
		const taxonomyCap = term.startsWith("g:") || term.startsWith("t:");
		if (list.length > TERM_DF_CAP || (taxonomyCap && list.length > relativeCap))
			continue;
		for (let x = 0; x < list.length; x++) {
			for (let y = x + 1; y < list.length; y++) {
				const a = list[x];
				const b = list[y];
				if (a !== undefined && b !== undefined) yield [a, b];
			}
		}
	}
}

export const MIN_SIMILARITY_SCORE = 0.03;
const MIN_SEMANTIC_EVIDENCE = 0.55;
const MIN_CONTRADICTING_SEMANTIC_EVIDENCE = 0.65;

function hasMeaningfulEvidence(
	workA: WorkAggregate,
	workB: WorkAggregate,
	components: Record<string, number>,
): boolean {
	const genre = components.genre ?? 0;
	const genresConflict =
		workA.genreIds.size > 0 && workB.genreIds.size > 0 && genre < 0.3;
	return (
		(components.author ?? 0) > 0 ||
		(components.cooc ?? 0) > 0 ||
		genre >= 0.3 ||
		(components.tag ?? 0) >= 0.2 ||
		(components.embedding ?? 0) >=
			(genresConflict
				? MIN_CONTRADICTING_SEMANTIC_EVIDENCE
				: MIN_SEMANTIC_EVIDENCE)
	);
}

function* semanticPairs(
	works: WorkAggregate[],
	space: EmbeddingSpace,
	workIndexOf: Map<WorkKey, number>,
): Generator<[number, number]> {
	const n = space.keys.length;
	if (n < 2 || works.length > SEMANTIC_MAX_WORKS) return;
	const useExact = works.length <= EXACT_KNN_MAX_WORKS;
	const ivf = useExact ? null : buildIvfIndex(space.vectors, n, EMBEDDING_DIM);
	for (let q = 0; q < n; q++) {
		const qKey = space.keys[q];
		if (qKey === undefined) continue;
		const wi = workIndexOf.get(qKey);
		if (wi === undefined) continue;
		const neighbors = ivf
			? searchIvfIndex(ivf, space.vectors, q, SEMANTIC_NEIGHBORS)
			: searchExact(space.vectors, n, EMBEDDING_DIM, q, SEMANTIC_NEIGHBORS);
		for (const nb of neighbors) {
			const nbKey = space.keys[nb.index];
			if (nbKey === undefined) continue;
			const ni = workIndexOf.get(nbKey);
			if (ni !== undefined) yield [wi, ni];
		}
	}
}

// n² dedup bits at this size stay under ~32 MB; beyond it fall back to a Set
const SEEN_BITSET_MAX_WORKS = 16384;

export function generateSimilarities(
	works: WorkAggregate[],
	ctx: ScoreContext,
	space: EmbeddingSpace | null,
): ScoredPair[] {
	const n = works.length;
	const workIndexOf = new Map<WorkKey, number>();
	for (let i = 0; i < n; i++) {
		const w = works[i];
		if (w) workIndexOf.set(workKey(w.kind, w.id), i);
	}

	const scoringIndex = buildWorkScoringIndex(works, ctx.idf);
	// work idx → row in the embedding space, so the hot loop dots raw vectors
	// instead of building key strings and probing maps per pair
	const spaceRow = new Int32Array(n).fill(-1);
	if (space && ctx.embeddingCos) {
		for (let i = 0; i < n; i++) {
			const w = works[i];
			if (!w) continue;
			spaceRow[i] = space.indexOf.get(workKey(w.kind, w.id)) ?? -1;
		}
	}
	const vectors = space?.vectors;
	const embeddingEnabled = ctx.embeddingCos !== null;
	const cosOf = (i: number, j: number): number | null => {
		if (!embeddingEnabled) return null;
		if (!vectors) {
			// keep custom embeddingCos implementations (tests/eval) working
			const wa = works[i];
			const wb = works[j];
			if (!wa || !wb || !ctx.embeddingCos) return null;
			return ctx.embeddingCos(workKey(wa.kind, wa.id), workKey(wb.kind, wb.id));
		}
		const ra = spaceRow[i] as number;
		const rb = spaceRow[j] as number;
		if (ra < 0 || rb < 0) return null;
		let s = 0;
		const ao = ra * EMBEDDING_DIM;
		const bo = rb * EMBEDDING_DIM;
		for (let d = 0; d < EMBEDDING_DIM; d++)
			s += (vectors[ao + d] as number) * (vectors[bo + d] as number);
		return s;
	};

	// per-seed top-K kept sorted ascending by (score, j) for cheap eviction
	const topK = new Map<
		number,
		{
			j: number;
			score: number;
			components: Record<string, number>;
			reason: ScoredPair["reason"];
		}[]
	>();
	const seenBits =
		n <= SEEN_BITSET_MAX_WORKS ? new Uint8Array(Math.ceil((n * n) / 8)) : null;
	const seenSet = seenBits ? null : new Set<number>();

	const consider = (i: number, j: number) => {
		if (i === j) return;
		const id = i < j ? i * n + j : j * n + i;
		if (seenBits) {
			const byte = id >> 3;
			const mask = 1 << (id & 7);
			if ((seenBits[byte] as number) & mask) return;
			seenBits[byte] = (seenBits[byte] as number) | mask;
		} else if (seenSet) {
			if (seenSet.has(id)) return;
			seenSet.add(id);
		}
		const workA = works[i];
		const workB = works[j];
		if (!workA || !workB) return;
		const sim = similarityIndexed(
			works,
			i,
			j,
			scoringIndex,
			ctx.idf,
			cosOf(i, j),
		);
		if (
			sim.score < MIN_SIMILARITY_SCORE ||
			!hasMeaningfulEvidence(workA, workB, sim.components)
		)
			return;
		for (const [seed, cand] of [
			[i, j],
			[j, i],
		] as const) {
			let list = topK.get(seed);
			if (!list) {
				list = [];
				topK.set(seed, list);
			}
			const weakest = list[0];
			if (
				list.length >= TOP_K_PER_SEED &&
				weakest &&
				sim.score <= weakest.score
			)
				continue;
			// binary insertion keeps the list sorted by (score, j) — same order the
			// previous per-insert sort produced
			let lo = 0;
			let hi = list.length;
			while (lo < hi) {
				const mid = (lo + hi) >> 1;
				const e = list[mid];
				if (e && (e.score < sim.score || (e.score === sim.score && e.j < cand)))
					lo = mid + 1;
				else hi = mid;
			}
			list.splice(lo, 0, {
				j: cand,
				score: sim.score,
				components: sim.components,
				reason: sim.reason,
			});
			if (list.length > TOP_K_PER_SEED) list.shift();
		}
	};

	for (const [i, j] of invertedIndexPairs(works)) consider(i, j);
	if (space)
		for (const [i, j] of semanticPairs(works, space, workIndexOf))
			consider(i, j);

	const out: ScoredPair[] = [];
	for (const [seedIdx, list] of topK) {
		const seedWork = works[seedIdx];
		if (!seedWork) continue;
		const seed = workKey(seedWork.kind, seedWork.id);
		for (const entry of list) {
			const candWork = works[entry.j];
			if (!candWork) continue;
			out.push({
				seed,
				cand: workKey(candWork.kind, candWork.id),
				score: entry.score,
				components: entry.components,
				reason: entry.reason,
			});
		}
	}
	return out;
}
