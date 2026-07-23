import { describe, expect, test } from "bun:test";
import {
	buildIdf,
	DEFAULT_WEIGHTS,
	embeddingSimilarity,
	similarity,
} from "../scorer";
import type { WorkAggregate } from "../types";

function makeWork(overrides: Partial<WorkAggregate> = {}): WorkAggregate {
	return {
		kind: "series",
		id: 1,
		authorIds: new Set(),
		genreIds: new Set(),
		tagIds: new Set(),
		publisherIds: new Set(),
		languageCode: null,
		memberBookIds: [1],
		embeddingText: "",
		engagedUserIds: new Set(),
		likeCount: 0,
		completionCount: 0,
		rating: null,
		ratingCount: null,
		createdAtMs: 0,
		...overrides,
	};
}

describe("embeddingSimilarity", () => {
	test("is a fixed affine transform over the real e5-small band [0.78, 0.92]", () => {
		expect(embeddingSimilarity(0.92)).toBeCloseTo(1);
		expect(embeddingSimilarity(0.78)).toBe(0);
		expect(embeddingSimilarity(0.85)).toBeCloseTo(0.5);
	});

	test("clamps below-range and above-range cosines", () => {
		expect(embeddingSimilarity(0.5)).toBe(0);
		expect(embeddingSimilarity(0)).toBe(0);
		expect(embeddingSimilarity(1.2)).toBe(1);
		expect(embeddingSimilarity(1)).toBe(1);
	});

	test("dead-zone neighbors (~0.885 cosine) clear the 0.55 evidence gate", () => {
		// previously (cos-0.75)/0.25 mapped 0.885 → 0.54, just under MIN_SEMANTIC_EVIDENCE
		expect(embeddingSimilarity(0.885)).toBeGreaterThan(0.55);
		// unrelated background (~0.78) still maps to ~0 so noise stays out
		expect(embeddingSimilarity(0.78)).toBe(0);
	});
});

describe("similarity", () => {
	const noEmb = { embeddingCos: null };

	test("same author dominates when nothing else matches", () => {
		const a = makeWork({ id: 1, authorIds: new Set([10]) });
		const b = makeWork({ id: 2, authorIds: new Set([10]) });
		const idf = buildIdf([a, b]);
		const result = similarity(a, b, { idf, ...noEmb });
		expect(result.score).toBeGreaterThan(0);
		expect(result.reason).toBe("same_author");
		expect(result.components.author).toBe(1);
	});

	test("rare tags outweigh ubiquitous genres (IDF)", () => {
		// genre 1 is on every work (df=n → idf≈0); tag 5 only on two works
		const works = Array.from({ length: 10 }, (_, i) =>
			makeWork({
				id: i + 1,
				genreIds: new Set([1]),
				tagIds: i < 2 ? new Set([5]) : new Set(),
			}),
		);
		const idf = buildIdf(works);
		const result = similarity(
			works[0] as WorkAggregate,
			works[1] as WorkAggregate,
			{
				idf,
				...noEmb,
			},
		);
		expect(result.components.tag).toBeGreaterThan(result.components.genre);
	});

	test("a broad shared genre does not imply perfect similarity", () => {
		const works = Array.from({ length: 20 }, (_, i) =>
			makeWork({
				id: i + 1,
				genreIds: i < 8 ? new Set([1]) : new Set([i]),
			}),
		);
		const result = similarity(
			works[0] as WorkAggregate,
			works[1] as WorkAggregate,
			{
				idf: buildIdf(works),
				...noEmb,
			},
		);
		expect(result.components.genre).toBeGreaterThan(0);
		expect(result.components.genre).toBeLessThan(0.4);
	});

	test("language mismatch penalizes; unknown language does not", () => {
		const jp = makeWork({ id: 1, authorIds: new Set([1]), languageCode: "ja" });
		const es = makeWork({ id: 2, authorIds: new Set([1]), languageCode: "es" });
		const unknown = makeWork({
			id: 3,
			authorIds: new Set([1]),
			languageCode: null,
		});
		const idf = buildIdf([jp, es, unknown]);
		const mismatch = similarity(jp, es, { idf, ...noEmb });
		const withUnknown = similarity(jp, unknown, { idf, ...noEmb });
		expect(mismatch.score).toBeCloseTo(withUnknown.score * 0.3);
	});

	test("co-occurrence needs at least 2 shared users", () => {
		const a = makeWork({ id: 1, engagedUserIds: new Set(["u1"]) });
		const b = makeWork({ id: 2, engagedUserIds: new Set(["u1"]) });
		const idf = buildIdf([a, b]);
		expect(similarity(a, b, { idf, ...noEmb }).components.cooc).toBe(0);

		const c = makeWork({ id: 3, engagedUserIds: new Set(["u1", "u2"]) });
		const d = makeWork({ id: 4, engagedUserIds: new Set(["u1", "u2"]) });
		expect(
			similarity(c, d, { idf: buildIdf([c, d]), ...noEmb }).components.cooc,
		).toBe(1);
	});

	test("weights renormalize when embeddings are unavailable", () => {
		const a = makeWork({ id: 1, authorIds: new Set([1]) });
		const b = makeWork({ id: 2, authorIds: new Set([1]) });
		const idf = buildIdf([a, b]);
		const without = similarity(a, b, { idf, embeddingCos: null });
		// author overlap = 1, all other components 0 → score = w_author / Σw(sin embedding)
		const weightSum =
			DEFAULT_WEIGHTS.author +
			DEFAULT_WEIGHTS.genre +
			DEFAULT_WEIGHTS.tag +
			DEFAULT_WEIGHTS.publisher +
			DEFAULT_WEIGHTS.cooc;
		expect(without.score).toBeCloseTo(DEFAULT_WEIGHTS.author / weightSum);
	});

	test("embedding component feeds score and reason when dominant", () => {
		const a = makeWork({ id: 1 });
		const b = makeWork({ id: 2 });
		const idf = buildIdf([a, b]);
		const result = similarity(a, b, { idf, embeddingCos: () => 1 });
		expect(result.components.embedding).toBe(1);
		expect(result.reason).toBe("similar_content");
		expect(result.score).toBeGreaterThan(0);
	});

	test("score is deterministic for the same inputs", () => {
		const a = makeWork({
			id: 1,
			authorIds: new Set([1]),
			tagIds: new Set([2]),
		});
		const b = makeWork({
			id: 2,
			authorIds: new Set([1]),
			tagIds: new Set([2]),
		});
		const idf = buildIdf([a, b]);
		const r1 = similarity(a, b, { idf, embeddingCos: () => 0.9 });
		const r2 = similarity(a, b, { idf, embeddingCos: () => 0.9 });
		expect(r1).toEqual(r2);
	});
});
