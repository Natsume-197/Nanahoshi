import { describe, expect, test } from "bun:test";
import type { Seed } from "../seed-selection";
import { clusterSeeds } from "../taste-clustering";
import type { WorkKey } from "../types";
import { workKey } from "../types";

const DIM = 8;

function seed(id: number, weight = 1, fromLike = false): Seed {
	return { key: workKey("series", id), weight, fromLike };
}

function vec(direction: number): Float32Array {
	const v = new Float32Array(DIM);
	v[direction % DIM] = 1;
	return v;
}

describe("clusterSeeds", () => {
	test("0 seeds → no clusters", () => {
		expect(clusterSeeds([], null, new Set())).toEqual([]);
	});

	test("1 seed → single cluster, that seed is the anchor", () => {
		const clusters = clusterSeeds([seed(1, 0.9)], null, new Set());
		expect(clusters.length).toBe(1);
		expect(clusters[0]?.anchor.key).toBe("series:1");
	});

	test("k never exceeds seed count", () => {
		const seeds = [seed(1), seed(2)];
		const vectors = new Map<WorkKey, Float32Array>([
			["series:1", vec(0)],
			["series:2", vec(4)],
		]);
		const clusters = clusterSeeds(seeds, vectors, new Set());
		expect(clusters.length).toBeLessThanOrEqual(2);
	});

	test("k-means separates two obvious taste groups", () => {
		const seeds = [
			seed(1, 1),
			seed(2, 0.9),
			seed(3, 0.8),
			seed(4, 1),
			seed(5, 0.9),
			seed(6, 0.8),
			seed(7, 1),
			seed(8, 0.9),
			seed(9, 0.8),
			seed(10, 0.7),
		];
		const vectors = new Map<WorkKey, Float32Array>(
			seeds.map((s, i) => [s.key, vec(i < 5 ? 0 : 4)]),
		);
		const clusters = clusterSeeds(seeds, vectors, new Set());
		expect(clusters.length).toBe(2);
		const groups = clusters.map((c) => new Set(c.seeds.map((s) => s.key)));
		// no group mixes the two orthogonal directions
		for (const g of groups) {
			const inFirst = [...g].filter((k) => Number(k.split(":")[1]) <= 5).length;
			expect(inFirst === 0 || inFirst === g.size).toBe(true);
		}
	});

	test("anchor is the highest-weight seed of its cluster", () => {
		const seeds = [seed(1, 0.5), seed(2, 1), seed(3, 0.7)];
		const clusters = clusterSeeds(seeds, null, new Set());
		const all = clusters.flatMap((c) => c.seeds.map((s) => s.key));
		expect(all.sort()).toEqual(["series:1", "series:2", "series:3"]);
		expect(clusters.some((c) => c.anchor.key === "series:2")).toBe(true);
	});

	test("connectivity fallback groups mutually-similar seeds without vectors", () => {
		const seeds = Array.from({ length: 10 }, (_, i) => seed(i + 1));
		const pairs = new Set<string>();
		// 1-5 all connected; 6-10 all connected; no cross edges
		for (let a = 1; a <= 5; a++)
			for (let b = a + 1; b <= 5; b++) pairs.add(`series:${a}|series:${b}`);
		for (let a = 6; a <= 10; a++)
			for (let b = a + 1; b <= 10; b++) pairs.add(`series:${a}|series:${b}`);
		const clusters = clusterSeeds(seeds, null, pairs);
		expect(clusters.length).toBe(2);
	});

	test("deterministic across runs", () => {
		const seeds = Array.from({ length: 12 }, (_, i) =>
			seed(i + 1, 1 - i * 0.05),
		);
		const vectors = new Map<WorkKey, Float32Array>(
			seeds.map((s, i) => [s.key, vec(i % 3)]),
		);
		const a = clusterSeeds(seeds, vectors, new Set());
		const b = clusterSeeds(seeds, vectors, new Set());
		expect(a.map((c) => c.seeds.map((s) => s.key))).toEqual(
			b.map((c) => c.seeds.map((s) => s.key)),
		);
	});
});
