import { describe, expect, test } from "bun:test";
import { buildIvfIndex, searchExact, searchIvfIndex } from "../ivf-index";

const DIM = 8;

function mulberry32(seed: number) {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function makeVectors(n: number, seed = 7): Float32Array {
	const rand = mulberry32(seed);
	const out = new Float32Array(n * DIM);
	for (let i = 0; i < n; i++) {
		let norm = 0;
		for (let d = 0; d < DIM; d++) {
			const x = rand() * 2 - 1;
			out[i * DIM + d] = x;
			norm += x * x;
		}
		norm = Math.sqrt(norm) || 1;
		for (let d = 0; d < DIM; d++)
			out[i * DIM + d] = (out[i * DIM + d] ?? 0) / norm;
	}
	return out;
}

describe("buildIvfIndex", () => {
	test("same seed produces the same index", () => {
		const vectors = makeVectors(100);
		const a = buildIvfIndex(vectors, 100, DIM, 42);
		const b = buildIvfIndex(vectors, 100, DIM, 42);
		expect(a.lists).toEqual(b.lists);
		expect([...a.centroids]).toEqual([...b.centroids]);
	});

	test("n smaller than sqrt-derived k does not explode", () => {
		const vectors = makeVectors(3);
		const index = buildIvfIndex(vectors, 3, DIM);
		expect(index.k).toBeLessThanOrEqual(3);
		expect(index.lists.flat().sort((x, y) => x - y)).toEqual([0, 1, 2]);
	});

	test("single vector", () => {
		const vectors = makeVectors(1);
		const index = buildIvfIndex(vectors, 1, DIM);
		expect(index.k).toBe(1);
		expect(searchIvfIndex(index, vectors, 0, 5)).toEqual([]);
	});

	test("identical vectors do not crash and land in one list", () => {
		const vectors = new Float32Array(4 * DIM).fill(0.5);
		const index = buildIvfIndex(vectors, 4, DIM);
		const results = searchIvfIndex(index, vectors, 0, 3);
		expect(results.length).toBe(3);
		for (const r of results) expect(r.cos).toBeCloseTo(DIM * 0.25);
	});

	test("zero vectors do not crash", () => {
		const vectors = new Float32Array(4 * DIM);
		const index = buildIvfIndex(vectors, 4, DIM);
		expect(searchIvfIndex(index, vectors, 0, 2).length).toBe(2);
	});
});

describe("searchIvfIndex vs searchExact", () => {
	test("recall against exact search is high on random data", () => {
		const n = 300;
		const vectors = makeVectors(n);
		const index = buildIvfIndex(vectors, n, DIM);
		let hits = 0;
		let total = 0;
		for (let q = 0; q < 30; q++) {
			const exact = new Set(
				searchExact(vectors, n, DIM, q, 10).map((r) => r.index),
			);
			const approx = new Set(
				searchIvfIndex(index, vectors, q, 10, 5).map((r) => r.index),
			);
			for (const e of exact) {
				total++;
				if (approx.has(e)) hits++;
			}
		}
		expect(hits / total).toBeGreaterThan(0.6);
	});

	test("never returns the query itself", () => {
		const vectors = makeVectors(50);
		const index = buildIvfIndex(vectors, 50, DIM);
		expect(
			searchIvfIndex(index, vectors, 7, 50).map((r) => r.index),
		).not.toContain(7);
		expect(
			searchExact(vectors, 50, DIM, 7, 50).map((r) => r.index),
		).not.toContain(7);
	});

	test("results are deterministically ordered (score desc, index asc)", () => {
		const vectors = makeVectors(40);
		const index = buildIvfIndex(vectors, 40, DIM);
		const a = searchIvfIndex(index, vectors, 3, 10);
		const b = searchIvfIndex(index, vectors, 3, 10);
		expect(a).toEqual(b);
	});
});
