import { describe, expect, test } from "bun:test";
import { computePopularity } from "../popularity";
import type { WorkAggregate } from "../types";

function makeWork(
	id: number,
	overrides: Partial<WorkAggregate> = {},
): WorkAggregate {
	return {
		kind: "book",
		id,
		authorIds: new Set(),
		genreIds: new Set(),
		tagIds: new Set(),
		publisherIds: new Set(),
		languageCode: null,
		memberBookIds: [id],
		embeddingText: "",
		engagedUserIds: new Set(),
		likeCount: 0,
		completionCount: 0,
		amazonRating: null,
		amazonReviewCount: null,
		createdAtMs: 0,
		...overrides,
	};
}

describe("computePopularity", () => {
	test("empty catalog produces no rows and no error", () => {
		expect(computePopularity([])).toEqual([]);
	});

	test("zero likes and completions everywhere does not divide by zero", () => {
		const entries = computePopularity([makeWork(1), makeWork(2)]);
		for (const e of entries) {
			expect(Number.isFinite(e.score)).toBe(true);
			expect(e.score).toBeGreaterThanOrEqual(0);
			expect(e.score).toBeLessThanOrEqual(1);
		}
	});

	test("missing rating and activity produce zero popularity", () => {
		expect(computePopularity([makeWork(1)])[0]?.score).toBe(0);
	});

	test("engaged users contribute even without likes or completions", () => {
		const entries = computePopularity([
			makeWork(1, { engagedUserIds: new Set(["u1", "u2"]) }),
			makeWork(2),
		]);
		expect(entries[0]?.id).toBe(1);
		expect(entries[0]?.score).toBeGreaterThan(0);
	});

	test("more likes → higher score", () => {
		const entries = computePopularity([
			makeWork(1, { likeCount: 10 }),
			makeWork(2, { likeCount: 1 }),
			makeWork(3, { likeCount: 0 }),
		]);
		expect(entries[0]?.id).toBe(1);
		expect(entries[2]?.id).toBe(3);
	});

	test("bayesian rating shrinks low-review-count ratings toward the prior", () => {
		const [fiveStarsFewReviews, fourStarsManyReviews] = computePopularity([
			makeWork(1, { amazonRating: 5, amazonReviewCount: 2 }),
			makeWork(2, { amazonRating: 4.5, amazonReviewCount: 5000 }),
		]).sort((a, b) => a.id - b.id);
		expect(fourStarsManyReviews?.score).toBeGreaterThan(
			fiveStarsFewReviews?.score ?? 0,
		);
	});

	test("full ties fall back to recency then id, deterministically", () => {
		const runs = [0, 1].map(() =>
			computePopularity([
				makeWork(3, { createdAtMs: 100 }),
				makeWork(1, { createdAtMs: 300 }),
				makeWork(2, { createdAtMs: 300 }),
			]).map((e) => e.id),
		);
		expect(runs[0]).toEqual([1, 2, 3]); // newest first, id breaks the 1-vs-2 tie
		expect(runs[0]).toEqual(runs[1] ?? []);
	});
});
