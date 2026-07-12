import type { Seed } from "./seed-selection";
import type { WorkKey } from "./types";

export interface TasteCluster {
	seeds: Seed[];
	anchor: Seed;
	centroid: Float32Array | null;
}

const KMEANS_ITERATIONS = 10;

function clusterCount(seedCount: number): number {
	if (seedCount <= 1) return seedCount;
	const k = Math.ceil(seedCount / 5);
	return Math.min(Math.max(2, Math.min(4, k)), seedCount);
}

function pickAnchor(seeds: Seed[]): Seed {
	return seeds.reduce((best, s) =>
		s.weight > best.weight || (s.weight === best.weight && s.key < best.key)
			? s
			: best,
	);
}

function kmeansClusters(
	seeds: Seed[],
	vectors: Map<WorkKey, Float32Array>,
	k: number,
): TasteCluster[] {
	const dim = vectors.values().next().value?.length ?? 0;
	const vecOf = (s: Seed) => vectors.get(s.key);
	const usable = seeds.filter((s) => vecOf(s));
	const rest = seeds.filter((s) => !vecOf(s));
	if (usable.length < k) return [wholeCluster(seeds)];

	// deterministic init: highest-weight seeds as initial centroids
	const sorted = [...usable].sort(
		(a, b) => b.weight - a.weight || (a.key < b.key ? -1 : 1),
	);
	const centroids = sorted
		.slice(0, k)
		.map((s) => Float32Array.from(vecOf(s) as Float32Array));

	let assign = new Array<number>(usable.length).fill(0);
	for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
		const next = usable.map((s) => {
			const v = vecOf(s) as Float32Array;
			let best = Number.NEGATIVE_INFINITY;
			let bi = 0;
			for (let c = 0; c < k; c++) {
				const centroid = centroids[c];
				if (!centroid) continue;
				let dot = 0;
				for (let d = 0; d < dim; d++) dot += (v[d] ?? 0) * (centroid[d] ?? 0);
				if (dot > best) {
					best = dot;
					bi = c;
				}
			}
			return bi;
		});
		if (next.every((c, i) => c === assign[i]) && iter > 0) break;
		assign = next;
		for (let c = 0; c < k; c++) {
			const members = usable.filter((_, i) => assign[i] === c);
			if (members.length === 0) continue;
			const sum = new Float32Array(dim);
			let totalW = 0;
			for (const m of members) {
				const v = vecOf(m) as Float32Array;
				for (let d = 0; d < dim; d++)
					sum[d] = (sum[d] ?? 0) + (v[d] ?? 0) * m.weight;
				totalW += m.weight;
			}
			let norm = 0;
			for (let d = 0; d < dim; d++) {
				sum[d] = (sum[d] ?? 0) / (totalW || 1);
				norm += (sum[d] ?? 0) ** 2;
			}
			norm = Math.sqrt(norm) || 1;
			for (let d = 0; d < dim; d++) sum[d] = (sum[d] ?? 0) / norm;
			centroids[c] = sum;
		}
	}

	const clusters: TasteCluster[] = [];
	for (let c = 0; c < k; c++) {
		const members = usable.filter((_, i) => assign[i] === c);
		if (members.length === 0) continue;
		clusters.push({
			seeds: members,
			anchor: pickAnchor(members),
			centroid: centroids[c] ?? null,
		});
	}
	// seeds without vectors join the cluster of the strongest anchor
	if (rest.length > 0) clusters[0]?.seeds.push(...rest);
	return clusters.sort((a, b) => b.anchor.weight - a.anchor.weight);
}

/** Fallback without embeddings: connected seeds (mutual similarity) group together. */
function connectivityClusters(
	seeds: Seed[],
	similarSeedPairs: Set<string>,
	k: number,
): TasteCluster[] {
	const clusters: Seed[][] = [];
	for (const seed of [...seeds].sort(
		(a, b) => b.weight - a.weight || (a.key < b.key ? -1 : 1),
	)) {
		const home = clusters.find((c) =>
			c.some(
				(m) =>
					similarSeedPairs.has(`${m.key}|${seed.key}`) ||
					similarSeedPairs.has(`${seed.key}|${m.key}`),
			),
		);
		if (home) home.push(seed);
		else if (clusters.length < k) clusters.push([seed]);
		else clusters[clusters.length - 1]?.push(seed);
	}
	return clusters.map((c) => ({
		seeds: c,
		anchor: pickAnchor(c),
		centroid: null,
	}));
}

function wholeCluster(seeds: Seed[]): TasteCluster {
	return { seeds, anchor: pickAnchor(seeds), centroid: null };
}

export function clusterSeeds(
	seeds: Seed[],
	vectors: Map<WorkKey, Float32Array> | null,
	similarSeedPairs: Set<string>,
): TasteCluster[] {
	if (seeds.length === 0) return [];
	const k = clusterCount(seeds.length);
	if (k <= 1) return [wholeCluster(seeds)];
	if (vectors && vectors.size > 0) return kmeansClusters(seeds, vectors, k);
	return connectivityClusters(seeds, similarSeedPairs, k);
}
