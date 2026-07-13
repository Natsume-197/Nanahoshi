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
					s += (vectors[off + d] as number) * (centroids[coff + d] as number);
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
					(centroids[coff + d] as number) + (vectors[off + d] as number);
		}
		for (let c = 0; c < k; c++) {
			if ((counts[c] ?? 0) === 0) continue;
			let norm = 0;
			const coff = c * dim;
			for (let d = 0; d < dim; d++)
				norm += (centroids[coff + d] as number) ** 2;
			norm = Math.sqrt(norm) || 1;
			for (let d = 0; d < dim; d++)
				centroids[coff + d] = (centroids[coff + d] as number) / norm;
		}
	}

	const lists: number[][] = Array.from({ length: k }, () => []);
	for (let i = 0; i < n; i++) lists[assign[i] ?? 0]?.push(i);
	return { dim, k, centroids, lists };
}

/**
 * Bounded top-N selection ordered by (score desc, index asc) — the exact total
 * order the previous sort+slice used, without allocating an object per scanned
 * candidate (which dominated search time at catalog scale).
 */
class TopN {
	readonly scores: Float64Array;
	readonly indices: Int32Array;
	count = 0;
	constructor(readonly capacity: number) {
		this.scores = new Float64Array(capacity);
		this.indices = new Int32Array(capacity);
	}

	offer(index: number, score: number): void {
		const { scores, indices, capacity, count } = this;
		if (count === capacity) {
			const worstScore = scores[count - 1] as number;
			if (
				score < worstScore ||
				(score === worstScore && index > (indices[count - 1] as number))
			)
				return;
		}
		// binary search for the insertion point under (score desc, index asc)
		let lo = 0;
		let hi = count;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			const ms = scores[mid] as number;
			if (ms > score || (ms === score && (indices[mid] as number) < index))
				lo = mid + 1;
			else hi = mid;
		}
		const last = Math.min(count, capacity - 1);
		for (let p = last; p > lo; p--) {
			scores[p] = scores[p - 1] as number;
			indices[p] = indices[p - 1] as number;
		}
		scores[lo] = score;
		indices[lo] = index;
		if (count < capacity) this.count = count + 1;
	}

	toResults(): { index: number; cos: number }[] {
		const out: { index: number; cos: number }[] = new Array(this.count);
		for (let p = 0; p < this.count; p++)
			out[p] = {
				index: this.indices[p] as number,
				cos: this.scores[p] as number,
			};
		return out;
	}
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

	const probes = new TopN(Math.min(nprobe, k));
	for (let c = 0; c < k; c++) {
		let s = 0;
		const coff = c * dim;
		for (let d = 0; d < dim; d++)
			s += (vectors[qoff + d] as number) * (centroids[coff + d] as number);
		probes.offer(c, s);
	}

	const best = new TopN(topN);
	for (let p = 0; p < probes.count; p++) {
		const c = probes.indices[p] as number;
		for (const i of lists[c] ?? []) {
			if (i === query) continue;
			let s = 0;
			const off = i * dim;
			for (let d = 0; d < dim; d++)
				s += (vectors[qoff + d] as number) * (vectors[off + d] as number);
			best.offer(i, s);
		}
	}
	return best.toResults();
}

export function searchExact(
	vectors: Float32Array,
	n: number,
	dim: number,
	query: number,
	topN: number,
): { index: number; cos: number }[] {
	const qoff = query * dim;
	const best = new TopN(topN);
	for (let i = 0; i < n; i++) {
		if (i === query) continue;
		let s = 0;
		const off = i * dim;
		for (let d = 0; d < dim; d++)
			s += (vectors[qoff + d] as number) * (vectors[off + d] as number);
		best.offer(i, s);
	}
	return best.toResults();
}
