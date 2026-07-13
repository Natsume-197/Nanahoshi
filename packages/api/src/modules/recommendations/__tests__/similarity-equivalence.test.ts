import { describe, expect, test } from "bun:test";
import {
	buildEmbeddingSpace,
	type EmbeddingSpace,
	embeddingCosOf,
	generateSimilarities,
	MIN_SIMILARITY_SCORE,
	TERM_DF_CAP,
	TERM_DF_MAX_RATIO,
	TOP_K_PER_SEED,
} from "../candidate-generation";
import { searchExact } from "../ivf-index";
import type { ScoreContext } from "../scorer";
import {
	buildIdf,
	buildWorkScoringIndex,
	similarity,
	similarityIndexed,
} from "../scorer";
import type { ScoredPair, WorkAggregate, WorkKey } from "../types";
import { workKey } from "../types";

// Deterministic PRNG so failures reproduce exactly.
function mulberry32(seed: number) {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randomSubset<T>(
	rand: () => number,
	pool: T[],
	maxSize: number,
): Set<T> {
	const size = Math.floor(rand() * (maxSize + 1));
	const out = new Set<T>();
	for (let i = 0; i < size; i++)
		out.add(pool[Math.floor(rand() * pool.length)] as T);
	return out;
}

function makeWorks(n: number, seed: number): WorkAggregate[] {
	const rand = mulberry32(seed);
	const authors = Array.from({ length: 60 }, (_, i) => i + 1);
	const genres = Array.from({ length: 25 }, (_, i) => i + 1);
	const tags = Array.from({ length: 40 }, (_, i) => i + 1);
	const publishers = Array.from({ length: 12 }, (_, i) => i + 1);
	const users = Array.from({ length: 300 }, (_, i) => `user-${i}`);
	const languages = [null, "ja", "en", "es"];
	return Array.from({ length: n }, (_, i) => ({
		kind: rand() < 0.5 ? ("series" as const) : ("book" as const),
		id: i + 1,
		authorIds: randomSubset(rand, authors, 3),
		genreIds: randomSubset(rand, genres, 5),
		tagIds: randomSubset(rand, tags, 6),
		publisherIds: randomSubset(rand, publishers, 2),
		languageCode: languages[Math.floor(rand() * languages.length)] ?? null,
		memberBookIds: [i + 1],
		embeddingText: `work ${i + 1}`,
		engagedUserIds: randomSubset(rand, users, 30) as Set<string>,
		likeCount: Math.floor(rand() * 5),
		completionCount: Math.floor(rand() * 5),
		amazonRating: null,
		amazonReviewCount: null,
		createdAtMs: Math.floor(rand() * 1_000_000),
	}));
}

function makeSpace(works: WorkAggregate[], seed: number): EmbeddingSpace {
	const rand = mulberry32(seed);
	return buildEmbeddingSpace(
		works.map((w) => {
			const v = new Float32Array(384);
			let norm = 0;
			for (let d = 0; d < 384; d++) {
				v[d] = rand() * 2 - 1;
				norm += (v[d] as number) ** 2;
			}
			norm = Math.sqrt(norm) || 1;
			for (let d = 0; d < 384; d++) v[d] = (v[d] as number) / norm;
			return { key: workKey(w.kind, w.id) as WorkKey, vector: v };
		}),
	);
}

// ---- golden reference: the pre-optimization generateSimilarities ----

const REF_MIN_SEMANTIC_EVIDENCE = 0.55;
const REF_MIN_CONTRADICTING_SEMANTIC_EVIDENCE = 0.65;
const REF_SEMANTIC_NEIGHBORS = 20;

function refHasMeaningfulEvidence(
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
				? REF_MIN_CONTRADICTING_SEMANTIC_EVIDENCE
				: REF_MIN_SEMANTIC_EVIDENCE)
	);
}

function* refInvertedIndexPairs(
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

function* refSemanticPairs(
	space: EmbeddingSpace,
	workIndexOf: Map<WorkKey, number>,
): Generator<[number, number]> {
	const n = space.keys.length;
	if (n < 2) return;
	for (let q = 0; q < n; q++) {
		const qKey = space.keys[q];
		if (qKey === undefined) continue;
		const wi = workIndexOf.get(qKey);
		if (wi === undefined) continue;
		const neighbors = searchExact(
			space.vectors,
			n,
			384,
			q,
			REF_SEMANTIC_NEIGHBORS,
		);
		for (const nb of neighbors) {
			const nbKey = space.keys[nb.index];
			if (nbKey === undefined) continue;
			const ni = workIndexOf.get(nbKey);
			if (ni !== undefined) yield [wi, ni];
		}
	}
}

function refGenerateSimilarities(
	works: WorkAggregate[],
	ctx: ScoreContext,
	space: EmbeddingSpace | null,
): ScoredPair[] {
	const workIndexOf = new Map<WorkKey, number>();
	for (let i = 0; i < works.length; i++) {
		const w = works[i];
		if (w) workIndexOf.set(workKey(w.kind, w.id), i);
	}
	const topK = new Map<
		number,
		{
			j: number;
			score: number;
			components: Record<string, number>;
			reason: ScoredPair["reason"];
		}[]
	>();
	const seen = new Set<number>();
	const pairId = (a: number, b: number) =>
		a < b ? a * works.length + b : b * works.length + a;

	const consider = (i: number, j: number) => {
		if (i === j) return;
		const id = pairId(i, j);
		if (seen.has(id)) return;
		seen.add(id);
		const workA = works[i];
		const workB = works[j];
		if (!workA || !workB) return;
		const sim = similarity(workA, workB, ctx);
		if (
			sim.score < MIN_SIMILARITY_SCORE ||
			!refHasMeaningfulEvidence(workA, workB, sim.components)
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
			list.push({
				j: cand,
				score: sim.score,
				components: sim.components,
				reason: sim.reason,
			});
			list.sort((a, b) => a.score - b.score || a.j - b.j);
			if (list.length > TOP_K_PER_SEED) list.shift();
		}
	};

	for (const [i, j] of refInvertedIndexPairs(works)) consider(i, j);
	if (space)
		for (const [i, j] of refSemanticPairs(space, workIndexOf)) consider(i, j);

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

const sortPairs = (pairs: ScoredPair[]) =>
	[...pairs].sort(
		(a, b) =>
			a.seed.localeCompare(b.seed) ||
			a.cand.localeCompare(b.cand) ||
			a.score - b.score,
	);

describe("similarityIndexed equivalence", () => {
	test("matches similarity() exactly for every pair, with embeddings", () => {
		const works = makeWorks(120, 7);
		const space = makeSpace(works, 11);
		const ctx: ScoreContext = {
			idf: buildIdf(works),
			embeddingCos: embeddingCosOf(space),
		};
		const index = buildWorkScoringIndex(works, ctx.idf);
		const cos = embeddingCosOf(space);
		for (let i = 0; i < works.length; i++) {
			for (let j = 0; j < works.length; j++) {
				if (i === j) continue;
				const a = works[i] as WorkAggregate;
				const b = works[j] as WorkAggregate;
				const expected = similarity(a, b, ctx);
				const actual = similarityIndexed(
					works,
					i,
					j,
					index,
					ctx.idf,
					cos(workKey(a.kind, a.id), workKey(b.kind, b.id)),
				);
				expect(actual.score).toBe(expected.score);
				expect(actual.reason).toBe(expected.reason);
				expect(actual.components).toEqual(expected.components);
			}
		}
	});

	test("matches similarity() exactly without embeddings", () => {
		const works = makeWorks(80, 23);
		const ctx: ScoreContext = { idf: buildIdf(works), embeddingCos: null };
		const index = buildWorkScoringIndex(works, ctx.idf);
		for (let i = 0; i < works.length; i++) {
			for (let j = i + 1; j < works.length; j++) {
				const a = works[i] as WorkAggregate;
				const b = works[j] as WorkAggregate;
				const expected = similarity(a, b, ctx);
				const actual = similarityIndexed(works, i, j, index, ctx.idf, null);
				expect(actual.score).toBe(expected.score);
				expect(actual.reason).toBe(expected.reason);
				expect(actual.components).toEqual(expected.components);
			}
		}
	});
});

describe("generateSimilarities equivalence with pre-optimization reference", () => {
	test("identical output with embeddings (exact kNN path)", () => {
		const works = makeWorks(400, 42);
		const space = makeSpace(works, 43);
		const ctx: ScoreContext = {
			idf: buildIdf(works),
			embeddingCos: embeddingCosOf(space),
		};
		const actual = generateSimilarities(works, ctx, space);
		const expected = refGenerateSimilarities(works, ctx, space);
		expect(actual.length).toBe(expected.length);
		expect(sortPairs(actual)).toEqual(sortPairs(expected));
	});

	test("identical output structured-only (no embeddings)", () => {
		const works = makeWorks(500, 77);
		const ctx: ScoreContext = { idf: buildIdf(works), embeddingCos: null };
		const actual = generateSimilarities(works, ctx, null);
		const expected = refGenerateSimilarities(works, ctx, null);
		expect(actual.length).toBe(expected.length);
		expect(sortPairs(actual)).toEqual(sortPairs(expected));
	});
});
