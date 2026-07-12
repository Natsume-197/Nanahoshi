// In-memory IVF-flat over unit vectors (cosine = dot). Deterministic:
// fixed-seed PRNG init + fixed iteration count. Phase 0 measured: 40k works
// build ~34s + full search ~57s on x86 (recall@20 ≈ 100%).

const KMEANS_ITERATIONS = 8;

function mulberry32(seed: number) {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface IvfIndex {
	dim: number;
	k: number;
	centroids: Float32Array;
	lists: number[][];
}

export function buildIvfIndex(
	vectors: Float32Array,
	n: number,
	dim: number,
	seed = 42,
): IvfIndex {
	const k = Math.max(1, Math.min(n, Math.round(Math.sqrt(n))));
	const rand = mulberry32(seed);
	const centroids = new Float32Array(k * dim);
	const picked = new Set<number>();
	for (let c = 0; c < k; c++) {
		let p = Math.floor(rand() * n);
		while (picked.has(p)) p = (p + 1) % n;
		picked.add(p);
		centroids.set(vectors.subarray(p * dim, p * dim + dim), c * dim);
	}

	const assign = new Int32Array(n);
	for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
		for (let i = 0; i < n; i++) {
			let best = Number.NEGATIVE_INFINITY;
			let bi = 0;
			const off = i * dim;
			for (let c = 0; c < k; c++) {
				let s = 0;
				const coff = c * dim;
				for (let d = 0; d < dim; d++)
					s += (vectors[off + d] ?? 0) * (centroids[coff + d] ?? 0);
				if (s > best) {
					best = s;
					bi = c;
				}
			}
			assign[i] = bi;
		}
		centroids.fill(0);
		const counts = new Int32Array(k);
		for (let i = 0; i < n; i++) {
			const c = assign[i] ?? 0;
			counts[c] = (counts[c] ?? 0) + 1;
			const off = i * dim;
			const coff = c * dim;
			for (let d = 0; d < dim; d++)
				centroids[coff + d] =
					(centroids[coff + d] ?? 0) + (vectors[off + d] ?? 0);
		}
		for (let c = 0; c < k; c++) {
			if ((counts[c] ?? 0) === 0) continue;
			let norm = 0;
			const coff = c * dim;
			for (let d = 0; d < dim; d++) norm += (centroids[coff + d] ?? 0) ** 2;
			norm = Math.sqrt(norm) || 1;
			for (let d = 0; d < dim; d++)
				centroids[coff + d] = (centroids[coff + d] ?? 0) / norm;
		}
	}

	const lists: number[][] = Array.from({ length: k }, () => []);
	for (let i = 0; i < n; i++) lists[assign[i] ?? 0]?.push(i);
	return { dim, k, centroids, lists };
}

export function searchIvfIndex(
	index: IvfIndex,
	vectors: Float32Array,
	query: number,
	topN: number,
	nprobe = 4,
): { index: number; cos: number }[] {
	const { dim, k, centroids, lists } = index;
	const qoff = query * dim;

	const centroidScores: { c: number; s: number }[] = [];
	for (let c = 0; c < k; c++) {
		let s = 0;
		const coff = c * dim;
		for (let d = 0; d < dim; d++)
			s += (vectors[qoff + d] ?? 0) * (centroids[coff + d] ?? 0);
		centroidScores.push({ c, s });
	}
	centroidScores.sort((a, b) => b.s - a.s || a.c - b.c);

	const results: { index: number; cos: number }[] = [];
	for (const { c } of centroidScores.slice(0, Math.min(nprobe, k))) {
		for (const i of lists[c] ?? []) {
			if (i === query) continue;
			let s = 0;
			const off = i * dim;
			for (let d = 0; d < dim; d++)
				s += (vectors[qoff + d] ?? 0) * (vectors[off + d] ?? 0);
			results.push({ index: i, cos: s });
		}
	}
	results.sort((a, b) => b.cos - a.cos || a.index - b.index);
	return results.slice(0, topN);
}

export function searchExact(
	vectors: Float32Array,
	n: number,
	dim: number,
	query: number,
	topN: number,
): { index: number; cos: number }[] {
	const qoff = query * dim;
	const results: { index: number; cos: number }[] = [];
	for (let i = 0; i < n; i++) {
		if (i === query) continue;
		let s = 0;
		const off = i * dim;
		for (let d = 0; d < dim; d++)
			s += (vectors[qoff + d] ?? 0) * (vectors[off + d] ?? 0);
		results.push({ index: i, cos: s });
	}
	results.sort((a, b) => b.cos - a.cos || a.index - b.index);
	return results.slice(0, topN);
}
