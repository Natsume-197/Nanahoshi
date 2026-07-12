import { describe, expect, test } from "bun:test";
import {
	createRollingTemporalHoldouts,
	createTemporalHoldout,
	evaluateHistoricalWalkForward,
	evaluateOfflinePredictions,
	mergeMixesForEvaluation,
	type OfflineMetricSummary,
} from "../offline-evaluation";
import {
	createHardSyntheticRecommendationDataset,
	createSyntheticRecommendationDataset,
} from "../offline-evaluation.synthetic";
import { workKey } from "../types";
import type { Mix } from "../user-feed";

describe("createTemporalHoldout", () => {
	test("hides the latest positive work completely and drops future signals", () => {
		const holdout = createTemporalHoldout([
			{ kind: "book", itemId: 1, signal: "completed", atMs: 100 },
			{ kind: "book", itemId: 2, signal: "like", atMs: 200 },
			{ kind: "book", itemId: 3, signal: "shelf", atMs: 250 },
			{ kind: "book", itemId: 3, signal: "completed", atMs: 300 },
			{ kind: "book", itemId: 4, signal: "not_interested", atMs: 280 },
			{ kind: "book", itemId: 5, signal: "not_interested", atMs: 400 },
		]);

		expect(holdout?.target).toBe("book:3");
		expect(holdout?.targetAtMs).toBe(300);
		expect(holdout?.trainingRows.some((row) => row.itemId === 3)).toBe(false);
		expect(holdout?.trainingRows.some((row) => row.itemId === 5)).toBe(false);
		expect(holdout?.negativeKeys).toEqual(["book:4"]);
	});

	test("requires enough distinct positive works", () => {
		expect(
			createTemporalHoldout([
				{ kind: "book", itemId: 1, signal: "like", atMs: 100 },
				{ kind: "book", itemId: 1, signal: "completed", atMs: 200 },
				{ kind: "book", itemId: 2, signal: "completed", atMs: 300 },
			]),
		).toBeNull();
	});
});

describe("createRollingTemporalHoldouts", () => {
	test("creates one case for each new positive after warm-up", () => {
		const holdouts = createRollingTemporalHoldouts([
			{
				userId: "u1",
				rows: [1, 2, 3, 4, 5].map((itemId) => ({
					kind: "book" as const,
					itemId,
					signal: "like",
					atMs: itemId * 100,
				})),
			},
		]);
		expect(holdouts.map((holdout) => holdout.target)).toEqual([
			"book:3",
			"book:4",
			"book:5",
		]);
		expect(holdouts.map((holdout) => holdout.ordinal)).toEqual([3, 4, 5]);
	});
});

describe("mergeMixesForEvaluation", () => {
	test("uses dashboard round-robin order and deduplicates works", () => {
		const item = (id: number) => ({
			key: workKey("book", id),
			score: 1,
			rank: 0,
			reason: "popular" as const,
			reasonKey: null,
			components: {},
		});
		const mixes: Mix[] = [
			{ mixIndex: 0, anchor: null, items: [item(1), item(2)] },
			{ mixIndex: 1, anchor: null, items: [item(3), item(2), item(4)] },
		];
		expect(mergeMixesForEvaluation(mixes, 4)).toEqual([
			"book:1",
			"book:3",
			"book:2",
			"book:4",
		]);
	});
});

describe("evaluateOfflinePredictions", () => {
	test("computes ranking, coverage, novelty, diversity and negative exposure", () => {
		const b2 = workKey("book", 2);
		const b3 = workKey("book", 3);
		const b4 = workKey("book", 4);
		const b5 = workKey("book", 5);
		const b6 = workKey("book", 6);
		const popularity = new Map([
			[b2, 0.2],
			[b3, 0.2],
			[b5, 0.2],
			[b6, 0.2],
		]);
		const similarity = (a: string, b: string) => {
			if (
				new Set([a, b]).size === 2 &&
				[a, b].includes(b2) &&
				[a, b].includes(b3)
			)
				return 0.5;
			if ([a, b].includes(b4) && [a, b].includes(b3)) return 0.4;
			return 0;
		};
		const report = evaluateOfflinePredictions(
			[
				{
					target: b2,
					recommendations: [b2, b3],
					negativeKeys: [b4],
					segments: ["kind:book"],
				},
				{
					target: b5,
					recommendations: [b6, b5],
					negativeKeys: [b6],
					segments: ["kind:book"],
				},
			],
			{
				k: 3,
				catalogSize: 10,
				popularity,
				similarity,
			},
		);

		expect(report.overall.recallAtK).toBe(1);
		expect(report.overall.ndcgAtK).toBeCloseTo((1 + 1 / Math.log2(3)) / 2);
		expect(report.overall.mrrAtK).toBe(0.75);
		expect(report.overall.averageListLength).toBe(2);
		expect(report.overall.catalogCoverage).toBe(0.4);
		expect(report.overall.novelty).toBeCloseTo(0.8);
		expect(report.overall.intraListDiversity).toBeCloseTo(0.75);
		expect(report.overall.exactNegativeExposureRate).toBe(0.25);
		expect(report.overall.similarNegativeExposureRate).toBe(0.5);
		expect(report.segments["kind:book"]?.cases).toBe(2);
	});
});

describe("evaluateHistoricalWalkForward", () => {
	test("reconstructs coherent synthetic preferences better than popularity", () => {
		const dataset = createSyntheticRecommendationDataset();
		const result = evaluateHistoricalWalkForward({
			...dataset,
			k: 10,
			maxCases: 30,
			caseSeed: 42,
		});

		expect(result.availableCases).toBe(120);
		expect(result.cases).toHaveLength(30);
		expect(result.report.overall.recallAtK).toBeGreaterThan(0.8);
		expect(result.report.overall.recallAtK).toBeGreaterThan(
			result.popularityBaseline.overall.recallAtK,
		);
		expect(result.report.overall.exactNegativeExposureRate).toBe(0);
		expect(result.report.overall.similarNegativeExposureRate).toBeLessThan(
			result.popularityBaseline.overall.similarNegativeExposureRate,
		);
	});

	// Guards the serving-time session boost (routers/recommendations/rerank.ts):
	// re-ranking toward recent reads must never demote the held-out next read
	// below the batch order, nor surface more negatives. Calibration finding: on
	// this well-separated synthetic catalog the boost is neutral-to-positive and
	// monotonic in the weight (measurable lift only at higher weights); the
	// production weight stays conservative because live flat/cold mixes — which
	// this clean dataset can't model — reshuffle harder at the same weight.
	test("session boost never regresses ndcg or raises negative exposure", () => {
		const dataset = createSyntheticRecommendationDataset();
		const evalAt = (sessionWeight: number) =>
			evaluateHistoricalWalkForward({
				...dataset,
				k: 10,
				maxCases: 200,
				sessionWeight,
			}).report.overall;

		const baseline = evalAt(0);
		for (const weight of [0.08, 0.24, 0.8]) {
			const boosted = evalAt(weight);
			expect(boosted.ndcgAtK).toBeGreaterThanOrEqual(baseline.ndcgAtK);
			expect(boosted.exactNegativeExposureRate).toBeLessThanOrEqual(
				baseline.exactNegativeExposureRate,
			);
			expect(boosted.similarNegativeExposureRate).toBeLessThanOrEqual(
				baseline.similarNegativeExposureRate,
			);
		}
		// a strong weight produces a strictly measurable ranking gain
		expect(evalAt(0.8).ndcgAtK).toBeGreaterThan(baseline.ndcgAtK);
	});

	// Hard multilingual dataset (drift/sampler/bilingual users, confusable
	// sub-genres, blockbuster noise). Calibration finding: session boost is
	// monotonically accuracy-POSITIVE with no interior optimum and no added
	// negative exposure — the accuracy objective wants a high weight. Production
	// keeps W_SESSION low for a UX reason the harness structurally cannot see:
	// the flat/cold-start mixes that reshuffle hard require ≥0 history, but every
	// holdout here has ≥3 positives, so that regime is off-harness.
	test("hard dataset: session boost helps monotonically without harming negatives", () => {
		const dataset = createHardSyntheticRecommendationDataset();
		const report = new Map<number, OfflineMetricSummary>();
		for (const sessionWeight of [0, 0.08, 0.2, 0.8]) {
			report.set(
				sessionWeight,
				evaluateHistoricalWalkForward({
					...dataset,
					k: 10,
					maxCases: 80,
					caseSeed: 42,
					sessionWeight,
				}).report.overall,
			);
		}
		const at = (w: number) => {
			const summary = report.get(w);
			if (!summary) throw new Error(`no report for weight ${w}`);
			return summary;
		};
		const baseline = at(0);
		// the dataset stays genuinely hard — recall must not saturate
		expect(baseline.recallAtK).toBeLessThan(0.9);
		// session boost lifts ranking of the held-out next read...
		expect(at(0.8).ndcgAtK).toBeGreaterThan(baseline.ndcgAtK);
		expect(at(0.08).ndcgAtK).toBeGreaterThanOrEqual(baseline.ndcgAtK);
		// ...and never surfaces more negatives at any weight
		for (const weight of [0.08, 0.2, 0.8]) {
			expect(at(weight).similarNegativeExposureRate).toBeLessThanOrEqual(
				baseline.similarNegativeExposureRate,
			);
		}
	}, 20000);
});
