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

	let weightSum = 0;
	let raw = 0;
	let bestComponent: ComponentName = "author";
	let bestWeighted = -1;
	for (const name of Object.keys(DEFAULT_WEIGHTS) as ComponentName[]) {
		if (name === "embedding" && cos === null) continue;
		const w = DEFAULT_WEIGHTS[name];
		weightSum += w;
		const weighted = w * components[name];
		raw += weighted;
		if (weighted > bestWeighted) {
			bestWeighted = weighted;
			bestComponent = name;
		}
	}

	const languageFactor =
		a.languageCode && b.languageCode && a.languageCode !== b.languageCode
			? LANGUAGE_MISMATCH_FACTOR
			: 1;

	return {
		score: clamp01((raw / weightSum) * languageFactor),
		components,
		reason: REASON_BY_COMPONENT[bestComponent],
	};
}
