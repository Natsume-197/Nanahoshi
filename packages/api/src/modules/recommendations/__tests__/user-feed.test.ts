import { describe, expect, test } from "bun:test";
import type { NegativeSeed, Seed } from "../seed-selection";
import type { TasteCluster } from "../taste-clustering";
import type { WorkKey } from "../types";
import { workKey } from "../types";
import {
	type BuildMixesInput,
	buildMixes,
	type SimilarityRow,
} from "../user-feed";

function seed(id: number, weight = 1, fromLike = false): Seed {
	return { key: workKey("series", id), weight, fromLike };
}

function negative(
	id: number,
	sims: SimilarityRow[],
	weight = 0.7,
	type: NegativeSeed["type"] = "not_interested",
): { seed: NegativeSeed; sims: SimilarityRow[] } {
	return { seed: { key: workKey("series", id), weight, type }, sims };
}

function cluster(seeds: Seed[]): TasteCluster {
	return {
		seeds,
		anchor: seeds.reduce((a, b) => (b.weight > a.weight ? b : a)),
		centroid: null,
	};
}

function simRow(
	candId: number,
	score: number,
	reason: SimilarityRow["reason"] = "same_author",
): SimilarityRow {
	return {
		cand: workKey("series", candId),
		score,
		components: { author: score },
		reason,
	};
}

function baseInput(overrides: Partial<BuildMixesInput> = {}): BuildMixesInput {
	return {
		clusters: [],
		similaritiesBySeed: new Map(),
		popularity: new Map(),
		popularOrder: [],
		exclusions: new Set(),
		vectors: null,
		primaryAuthorByWork: null,
		...overrides,
	};
}

describe("buildMixes", () => {
	test("cold start (no clusters) → single popular mix without excluded works", () => {
		const mixes = buildMixes(
			baseInput({
				popularity: new Map([
					["series:1", 0.9],
					["series:2", 0.8],
					["series:3", 0.7],
				]),
				popularOrder: ["series:1", "series:2", "series:3"],
				exclusions: new Set<WorkKey>(["series:2"]),
			}),
		);
		expect(mixes.length).toBe(1);
		expect(mixes[0]?.anchor).toBeNull();
		expect(mixes[0]?.items.map((i) => i.key)).toEqual(["series:1", "series:3"]);
		expect(mixes[0]?.items.every((i) => i.reason === "popular")).toBe(true);
	});

	test("exclusions never appear in personalized mixes", () => {
		const s = seed(1);
		const mixes = buildMixes(
			baseInput({
				clusters: [cluster([s])],
				similaritiesBySeed: new Map([
					[s.key, [simRow(10, 0.9), simRow(11, 0.8)]],
				]),
				exclusions: new Set<WorkKey>(["series:10"]),
			}),
		);
		const keys = mixes.flatMap((m) => m.items.map((i) => i.key));
		expect(keys).toContain("series:11");
		expect(keys).not.toContain("series:10");
	});

	test("cross-mix dedup: a work lands only in its best mix", () => {
		const s1 = seed(1, 1);
		const s2 = seed(2, 0.3);
		const mixes = buildMixes(
			baseInput({
				clusters: [cluster([s1]), cluster([s2])],
				similaritiesBySeed: new Map([
					[s1.key, [simRow(10, 0.9)]],
					[s2.key, [simRow(10, 0.9), simRow(11, 0.5)]],
				]),
			}),
		);
		const occurrences = mixes
			.flatMap((m) => m.items.map((i) => i.key))
			.filter((k) => k === "series:10");
		expect(occurrences.length).toBe(1);
		// s1 has higher seed weight → work 10 belongs to s1's mix
		expect(mixes[0]?.items.some((i) => i.key === "series:10")).toBe(true);
	});

	test("reason: because_you_liked when the dominant seed was liked", () => {
		const liked = seed(1, 1, true);
		const mixes = buildMixes(
			baseInput({
				clusters: [cluster([liked])],
				similaritiesBySeed: new Map([
					[liked.key, [simRow(10, 0.9, "same_author")]],
				]),
			}),
		);
		expect(mixes[0]?.items[0]?.reason).toBe("because_you_liked");
		expect(mixes[0]?.items[0]?.reasonKey).toBe("series:1");
	});

	test("reason: similarity reason kept when the seed was not liked", () => {
		const s = seed(1, 0.8, false);
		const mixes = buildMixes(
			baseInput({
				clusters: [cluster([s])],
				similaritiesBySeed: new Map([
					[s.key, [simRow(10, 0.9, "shared_genres")]],
				]),
			}),
		);
		expect(mixes[0]?.items[0]?.reason).toBe("shared_genres");
	});

	test("diversity: max 4 items per primary author in the head of a mix", () => {
		const s = seed(1);
		const rows = Array.from({ length: 12 }, (_, i) =>
			simRow(10 + i, 0.9 - i * 0.01),
		);
		const primaryAuthorByWork = new Map<WorkKey, number>(
			rows.map((r) => [r.cand, 7]), // all same author
		);
		const mixes = buildMixes(
			baseInput({
				clusters: [cluster([s])],
				similaritiesBySeed: new Map([[s.key, rows]]),
				primaryAuthorByWork,
			}),
		);
		// 4 by author cap + 2 exploration slots
		expect(mixes[0]?.items.length).toBe(6);
	});

	test("one seed cannot flood a multi-seed mix (reason cap)", () => {
		const s1 = seed(1, 1);
		const s2 = seed(2, 0.9);
		const s3 = seed(3, 0.85);
		const s4 = seed(4, 0.8);
		const s5 = seed(5, 0.75);
		// s1 has 15 strong candidates; the others have 3 weak ones each
		const flood = Array.from({ length: 15 }, (_, i) =>
			simRow(100 + i, 0.95 - i * 0.001),
		);
		const makeRows = (base: number) => [
			simRow(base, 0.3),
			simRow(base + 1, 0.29),
			simRow(base + 2, 0.28),
		];
		const mixes = buildMixes(
			baseInput({
				clusters: [
					{
						seeds: [s1, s2, s3, s4, s5],
						anchor: s1,
						centroid: null,
					},
				],
				similaritiesBySeed: new Map([
					[s1.key, flood],
					[s2.key, makeRows(200)],
					[s3.key, makeRows(300)],
					[s4.key, makeRows(400)],
					[s5.key, makeRows(500)],
				]),
			}),
		);
		const fromS1 = mixes[0]?.items.filter(
			(i) =>
				i.reasonKey === s1.key && i.rank < (mixes[0]?.items.length ?? 0) - 2,
		);
		// cap = max(3, ceil(20/5)) = 4 in the diversity head
		expect(fromS1?.length ?? 0).toBeLessThanOrEqual(4 + 2);
		expect(mixes[0]?.items.some((i) => i.reasonKey === s2.key)).toBe(true);
	});

	test("ranks are consecutive from 0 and deterministic", () => {
		const s = seed(1);
		const rows = [simRow(10, 0.9), simRow(11, 0.8), simRow(12, 0.7)];
		const run = () =>
			buildMixes(
				baseInput({
					clusters: [cluster([s])],
					similaritiesBySeed: new Map([[s.key, rows]]),
				}),
			);
		const a = run();
		expect(a[0]?.items.map((i) => i.rank)).toEqual([0, 1, 2]);
		expect(a).toEqual(run());
	});

	test("popularity blends into the final score", () => {
		const s = seed(1);
		const mixes = buildMixes(
			baseInput({
				clusters: [cluster([s])],
				similaritiesBySeed: new Map([
					[s.key, [simRow(10, 0.5), simRow(11, 0.5)]],
				]),
				popularity: new Map([
					["series:11", 1],
					["series:10", 0],
				]),
			}),
		);
		expect(mixes[0]?.items[0]?.key).toBe("series:11");
	});

	test("a clearly closer niche work outranks a weakly-similar mega-franchise", () => {
		// regression: with W_POP=0.15 the popular-but-unrelated franchise (series:11)
		// buried the closer niche match (series:10) — "why does liking a romance
		// recommend SAO". Similarity must dominate popularity by this margin.
		const s = seed(1);
		const mixes = buildMixes(
			baseInput({
				clusters: [cluster([s])],
				similaritiesBySeed: new Map([
					[s.key, [simRow(10, 0.2), simRow(11, 0.166)]],
				]),
				popularity: new Map([
					["series:10", 0], // niche, no engagement
					["series:11", 0.37], // mega-franchise
				]),
			}),
		);
		expect(mixes[0]?.items[0]?.key).toBe("series:10");
	});

	test("scores remain calibrated instead of scaling the best candidate to one", () => {
		const s = seed(1);
		const mixes = buildMixes(
			baseInput({
				clusters: [cluster([s])],
				similaritiesBySeed: new Map([[s.key, [simRow(10, 0.25)]]]),
			}),
		);
		expect(mixes[0]?.items[0]?.score).toBeGreaterThan(0.2);
		expect(mixes[0]?.items[0]?.score).toBeLessThan(0.3);
	});

	test("equivalent recommendation titles are shown only once", () => {
		const s = seed(1);
		const mixes = buildMixes(
			baseInput({
				clusters: [cluster([s])],
				similaritiesBySeed: new Map([
					[s.key, [simRow(10, 0.9), simRow(11, 0.8), simRow(12, 0.7)]],
				]),
				titleKeyByWork: new Map([
					["series:10", "新装版ロードス島戦記"],
					["series:11", "新装版ロードス島戦記灰色の魔女"],
					["series:12", "別の作品"],
				]),
			}),
		);
		expect(mixes[0]?.items.map((item) => item.key)).toEqual([
			"series:10",
			"series:12",
		]);
	});

	test("negative feedback demotes a similar candidate below an unrelated one", () => {
		const s = seed(1);
		const mixes = buildMixes(
			baseInput({
				clusters: [cluster([s])],
				similaritiesBySeed: new Map([
					// 11 is a stronger match than 10 and would win without feedback
					[s.key, [simRow(10, 0.5), simRow(11, 0.6)]],
				]),
				// user rejected work 90, which is highly similar to candidate 11
				negatives: [negative(90, [simRow(11, 0.9)])],
			}),
		);
		const keys = mixes[0]?.items.map((i) => i.key);
		// the feed survives (10 is untouched) and 11 is pushed to the bottom
		expect(keys?.[0]).toBe("series:10");
		expect(keys).toContain("series:11");
		const score10 =
			mixes[0]?.items.find((i) => i.key === "series:10")?.score ?? 0;
		const score11 =
			mixes[0]?.items.find((i) => i.key === "series:11")?.score ?? 0;
		expect(score11).toBeLessThan(score10);
	});

	test("MAX penalty: stacking negatives of one series can't over-bury a candidate", () => {
		const s = seed(1);
		const build = (negativeCount: number) =>
			buildMixes(
				baseInput({
					clusters: [cluster([s])],
					similaritiesBySeed: new Map([[s.key, [simRow(10, 0.5)]]]),
					// N abandoned volumes, each equally similar to candidate 10
					negatives: Array.from({ length: negativeCount }, (_, i) =>
						negative(90 + i, [simRow(10, 0.5)], 0.3, "abandoned"),
					),
				}),
			);
		const oneScore = build(1)[0]?.items[0]?.score;
		const threeScore = build(3)[0]?.items[0]?.score;
		// SUM would compound to 3× the penalty; MAX keeps it at a single rejection
		expect(threeScore).toBe(oneScore);
	});

	test("abandoned penalizes more gently than not_interested", () => {
		const s = seed(1);
		const scoreWith = (neg: { seed: NegativeSeed; sims: SimilarityRow[] }) =>
			buildMixes(
				baseInput({
					clusters: [cluster([s])],
					similaritiesBySeed: new Map([[s.key, [simRow(10, 0.6)]]]),
					negatives: [neg],
				}),
			)[0]?.items[0]?.score ?? 0;
		const abandonedScore = scoreWith(
			negative(90, [simRow(10, 0.9)], 0.3, "abandoned"),
		);
		const rejectedScore = scoreWith(
			negative(90, [simRow(10, 0.9)], 0.7, "not_interested"),
		);
		expect(abandonedScore).toBeGreaterThan(rejectedScore);
	});

	test("candidates far from any negative are unaffected", () => {
		const s = seed(1);
		const withNeg = buildMixes(
			baseInput({
				clusters: [cluster([s])],
				similaritiesBySeed: new Map([[s.key, [simRow(10, 0.5)]]]),
				negatives: [negative(90, [simRow(999, 0.9)])], // unrelated candidate
			}),
		);
		const without = buildMixes(
			baseInput({
				clusters: [cluster([s])],
				similaritiesBySeed: new Map([[s.key, [simRow(10, 0.5)]]]),
			}),
		);
		expect(withNeg[0]?.items[0]?.score).toBe(without[0]?.items[0]?.score);
	});

	test("cold start omits zero-signal filler when real popularity exists", () => {
		const mixes = buildMixes(
			baseInput({
				popularity: new Map([
					["series:1", 0.5],
					["series:2", 0],
				]),
				popularOrder: ["series:1", "series:2"],
			}),
		);
		expect(mixes[0]?.items.map((item) => item.key)).toEqual(["series:1"]);
	});
});
