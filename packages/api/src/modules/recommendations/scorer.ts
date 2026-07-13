import type { RecommendationReason, WorkAggregate, WorkKey } from "./types";
import { workKey } from "./types";

// Bump whenever weights/formula change — feeds the catalog fingerprint so
// precomputed similarities are rebuilt.
export const WEIGHTS_VERSION = 8;

export const DEFAULT_WEIGHTS = {
	author: 0.25,
	genre: 0.18,
	tag: 0.15,
	embedding: 0.27,
	publisher: 0.03,
	cooc: 0.12,
} as const;

export type ComponentName = keyof typeof DEFAULT_WEIGHTS;

// multilingual-e5-small over short catalog texts: unrelated works sit ~0.78,
// genuinely related content tops out ~0.88–0.92 — the discriminating band is
// [0.78, 0.92], not [0.75, 1]. Fixed affine transform over that real range
// keeps scores deterministic and batch-independent (never normalize against
// the batch), and spreads the useful signal across the whole [0,1] output
// instead of compressing it below the evidence gate.
export function embeddingSimilarity(cos: number): number {
	return clamp01((cos - 0.78) / 0.14);
}

const LANGUAGE_MISMATCH_FACTOR = 0.3;
const MIN_CO_USERS = 2;

function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}

export interface IdfIndex {
	genre: Map<number, number>;
	tag: Map<number, number>;
	max: number;
}

export function buildIdf(works: WorkAggregate[]): IdfIndex {
	const n = works.length;
	const df = {
		genre: new Map<number, number>(),
		tag: new Map<number, number>(),
	};
	for (const w of works) {
		for (const g of w.genreIds) df.genre.set(g, (df.genre.get(g) ?? 0) + 1);
		for (const t of w.tagIds) df.tag.set(t, (df.tag.get(t) ?? 0) + 1);
	}
	const idf = (m: Map<number, number>) => {
		const out = new Map<number, number>();
		for (const [term, count] of m)
			out.set(term, Math.log((n + 1) / (count + 1)));
		return out;
	};
	return {
		genre: idf(df.genre),
		tag: idf(df.tag),
		max: Math.log(n + 1) || 1,
	};
}

function idfCosine(
	a: Set<number>,
	b: Set<number>,
	idf: Map<number, number>,
	maxIdf: number,
): number {
	if (a.size === 0 || b.size === 0) return 0;
	let shared = 0;
	let normA = 0;
	let normB = 0;
	let strongestShared = 0;
	for (const t of a) {
		const termIdf = idf.get(t) ?? 0;
		const w = termIdf ** 2;
		normA += w;
		if (b.has(t)) {
			shared += w;
			strongestShared = Math.max(strongestShared, termIdf);
		}
	}
	for (const t of b) normB += (idf.get(t) ?? 0) ** 2;
	if (normA === 0 || normB === 0) return 0;
	// Cosine alone reports 1 for two works sharing only the same broad category.
	// Scale it by how informative their strongest shared term actually is.
	return (
		(shared / Math.sqrt(normA * normB)) *
		clamp01(strongestShared / Math.max(maxIdf, Number.EPSILON))
	);
}

function setOverlap(a: Set<number>, b: Set<number>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let shared = 0;
	for (const x of a) if (b.has(x)) shared++;
	return shared / Math.min(a.size, b.size);
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let shared = 0;
	for (const x of a) if (b.has(x)) shared++;
	if (shared < MIN_CO_USERS) return 0;
	return shared / (a.size + b.size - shared);
}

export interface ScoreContext {
	idf: IdfIndex;
	// null when embeddings are disabled/unavailable — weights renormalize
	embeddingCos: ((a: WorkKey, b: WorkKey) => number | null) | null;
}

export interface SimilarityResult {
	score: number;
	components: Record<ComponentName, number>;
	reason: RecommendationReason;
}

const REASON_BY_COMPONENT: Record<ComponentName, RecommendationReason> = {
	author: "same_author",
	genre: "shared_genres",
	tag: "shared_genres",
	embedding: "similar_content",
	publisher: "same_publisher",
	cooc: "readers_also_liked",
};

function combineComponents(
	components: Record<ComponentName, number>,
	hasEmbedding: boolean,
	languageMismatch: boolean,
): SimilarityResult {
	let weightSum = 0;
	let raw = 0;
	let bestComponent: ComponentName = "author";
	let bestWeighted = -1;
	for (const name of Object.keys(DEFAULT_WEIGHTS) as ComponentName[]) {
		if (name === "embedding" && !hasEmbedding) continue;
		const w = DEFAULT_WEIGHTS[name];
		weightSum += w;
		const weighted = w * components[name];
		raw += weighted;
		if (weighted > bestWeighted) {
			bestWeighted = weighted;
			bestComponent = name;
		}
	}

	const languageFactor = languageMismatch ? LANGUAGE_MISMATCH_FACTOR : 1;

	return {
		score: clamp01((raw / weightSum) * languageFactor),
		components,
		reason: REASON_BY_COMPONENT[bestComponent],
	};
}

export function similarity(
	a: WorkAggregate,
	b: WorkAggregate,
	ctx: ScoreContext,
): SimilarityResult {
	const cos =
		ctx.embeddingCos?.(workKey(a.kind, a.id), workKey(b.kind, b.id)) ?? null;
	const components: Record<ComponentName, number> = {
		author: setOverlap(a.authorIds, b.authorIds),
		genre: idfCosine(a.genreIds, b.genreIds, ctx.idf.genre, ctx.idf.max),
		tag: idfCosine(a.tagIds, b.tagIds, ctx.idf.tag, ctx.idf.max),
		embedding: cos === null ? 0 : embeddingSimilarity(cos),
		publisher: setOverlap(a.publisherIds, b.publisherIds),
		cooc: jaccard(a.engagedUserIds, b.engagedUserIds),
	};

	return combineComponents(
		components,
		cos !== null,
		Boolean(
			a.languageCode && b.languageCode && a.languageCode !== b.languageCode,
		),
	);
}

/**
 * Precomputed per-work data for the O(pairs) rebuild hot loop. Produces results
 * identical to similarity(): IDF norms are summed in the same set-iteration
 * order, and set intersections are exact integer counts, so every float op
 * matches the naive path bit for bit.
 */
export interface WorkScoringIndex {
	genreTerms: Int32Array[];
	tagTerms: Int32Array[];
	genreNorm: Float64Array;
	tagNorm: Float64Array;
	// engaged user ids interned to ints, sorted — intersection by merge walk
	engaged: Int32Array[];
	authors: Int32Array[];
	publishers: Int32Array[];
}

function sortedInts(values: Iterable<number>): Int32Array {
	return Int32Array.from(values).sort();
}

export function buildWorkScoringIndex(
	works: WorkAggregate[],
	idf: IdfIndex,
): WorkScoringIndex {
	const n = works.length;
	const index: WorkScoringIndex = {
		genreTerms: new Array(n),
		tagTerms: new Array(n),
		genreNorm: new Float64Array(n),
		tagNorm: new Float64Array(n),
		engaged: new Array(n),
		authors: new Array(n),
		publishers: new Array(n),
	};
	const userIntern = new Map<string, number>();
	for (let i = 0; i < n; i++) {
		const w = works[i];
		if (!w) continue;
		index.genreTerms[i] = Int32Array.from(w.genreIds);
		index.tagTerms[i] = Int32Array.from(w.tagIds);
		let genreNorm = 0;
		for (const t of w.genreIds) genreNorm += (idf.genre.get(t) ?? 0) ** 2;
		index.genreNorm[i] = genreNorm;
		let tagNorm = 0;
		for (const t of w.tagIds) tagNorm += (idf.tag.get(t) ?? 0) ** 2;
		index.tagNorm[i] = tagNorm;
		const engaged = new Int32Array(w.engagedUserIds.size);
		let e = 0;
		for (const u of w.engagedUserIds) {
			let id = userIntern.get(u);
			if (id === undefined) {
				id = userIntern.size;
				userIntern.set(u, id);
			}
			engaged[e++] = id;
		}
		index.engaged[i] = engaged.sort();
		index.authors[i] = sortedInts(w.authorIds);
		index.publishers[i] = sortedInts(w.publisherIds);
	}
	return index;
}

function intersectSorted(a: Int32Array, b: Int32Array): number {
	let shared = 0;
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		const x = a[i] as number;
		const y = b[j] as number;
		if (x === y) {
			shared++;
			i++;
			j++;
		} else if (x < y) i++;
		else j++;
	}
	return shared;
}

function overlapSorted(a: Int32Array, b: Int32Array): number {
	if (a.length === 0 || b.length === 0) return 0;
	return intersectSorted(a, b) / Math.min(a.length, b.length);
}

function jaccardSorted(a: Int32Array, b: Int32Array): number {
	if (a.length === 0 || b.length === 0) return 0;
	const shared = intersectSorted(a, b);
	if (shared < MIN_CO_USERS) return 0;
	return shared / (a.length + b.length - shared);
}

function idfCosineIndexed(
	termsA: Int32Array,
	setB: Set<number>,
	normA: number,
	normB: number,
	idf: Map<number, number>,
	maxIdf: number,
): number {
	if (termsA.length === 0 || setB.size === 0) return 0;
	let shared = 0;
	let strongestShared = 0;
	for (let i = 0; i < termsA.length; i++) {
		const t = termsA[i] as number;
		if (setB.has(t)) {
			const termIdf = idf.get(t) ?? 0;
			shared += termIdf ** 2;
			strongestShared = Math.max(strongestShared, termIdf);
		}
	}
	if (normA === 0 || normB === 0) return 0;
	return (
		(shared / Math.sqrt(normA * normB)) *
		clamp01(strongestShared / Math.max(maxIdf, Number.EPSILON))
	);
}

/** similarity() over precomputed indices; `cos` is supplied by the caller. */
export function similarityIndexed(
	works: WorkAggregate[],
	ia: number,
	ib: number,
	index: WorkScoringIndex,
	idf: IdfIndex,
	cos: number | null,
): SimilarityResult {
	const a = works[ia] as WorkAggregate;
	const b = works[ib] as WorkAggregate;
	const components: Record<ComponentName, number> = {
		author: overlapSorted(
			index.authors[ia] as Int32Array,
			index.authors[ib] as Int32Array,
		),
		genre: idfCosineIndexed(
			index.genreTerms[ia] as Int32Array,
			b.genreIds,
			index.genreNorm[ia] as number,
			index.genreNorm[ib] as number,
			idf.genre,
			idf.max,
		),
		tag: idfCosineIndexed(
			index.tagTerms[ia] as Int32Array,
			b.tagIds,
			index.tagNorm[ia] as number,
			index.tagNorm[ib] as number,
			idf.tag,
			idf.max,
		),
		embedding: cos === null ? 0 : embeddingSimilarity(cos),
		publisher: overlapSorted(
			index.publishers[ia] as Int32Array,
			index.publishers[ib] as Int32Array,
		),
		cooc: jaccardSorted(
			index.engaged[ia] as Int32Array,
			index.engaged[ib] as Int32Array,
		),
	};

	return combineComponents(
		components,
		cos !== null,
		Boolean(
			a.languageCode && b.languageCode && a.languageCode !== b.languageCode,
		),
	);
}
