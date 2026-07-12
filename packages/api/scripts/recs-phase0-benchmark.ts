// Fase 0 benchmark for the recommender system. Run on target hardware:
//   bun run packages/api/scripts/recs-phase0-benchmark.ts [--wasm] [--works=40000]
// Measures: embedding ms/text (multilingual-e5-small q8), IVF-flat vs exact kNN
// (build/search time + recall@20), and peak RSS. Model is cached under
// apps/server/data/models/ — first run downloads ~120 MB (excluded from timings).

import { env, pipeline } from "@huggingface/transformers";

const DIM = 384;
const TOPN = 20;
const useWasm = process.argv.includes("--wasm");
const worksArg = process.argv.find((a) => a.startsWith("--works="));
const N_WORKS = worksArg ? Number(worksArg.split("=")[1]) : 40000;

env.cacheDir = new URL(
	"../../../apps/server/data/models/",
	import.meta.url,
).pathname;
if (useWasm) env.backends.onnx.backend = "wasm";

const rss = () => `${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB`;

console.log(
	`bun ${Bun.version} ${process.platform}/${process.arch} backend=${useWasm ? "wasm" : "auto"} works=${N_WORKS}`,
);

// ---- 1. embedding throughput ----
const SAMPLES = [
	"query: 転生したらスライムだった件 異世界 ファンタジー 魔物 成り上がり",
	"query: The quiet melancholy of a small-town bookshop mystery, retired detective, cozy crime",
	"query: Novela ligera de fantasía isekai, villana reencarnada, romance, comedia",
	"query: 薬屋のひとりごと 後宮 ミステリー 中華風 薬師の少女が謎を解く",
];
const t0 = performance.now();
const extractor = await pipeline(
	"feature-extraction",
	"Xenova/multilingual-e5-small",
	{ dtype: "q8" },
);
console.log(
	`model load: ${(performance.now() - t0).toFixed(0)} ms | RSS ${rss()}`,
);
await extractor(SAMPLES[0], { pooling: "mean", normalize: true }); // warmup

const REPS = 20;
const t1 = performance.now();
for (let i = 0; i < REPS; i++)
	await extractor(SAMPLES[i % SAMPLES.length], {
		pooling: "mean",
		normalize: true,
	});
const msPerText = (performance.now() - t1) / REPS;
console.log(
	`embedding: ${msPerText.toFixed(1)} ms/text | first embed of ${N_WORKS} works ≈ ${((msPerText * N_WORKS) / 60000).toFixed(0)} min | RSS ${rss()}`,
);

// ---- 2. IVF vs exact on synthetic vectors ----
function mulberry32(seed: number) {
	let state = seed;
	return () => {
		state |= 0;
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rand = mulberry32(42);
function gaussian() {
	let u = 0;
	let v = 0;
	while (u === 0) u = rand();
	while (v === 0) v = rand();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const centers = Math.max(20, Math.floor(N_WORKS / 100));
const cents = Float32Array.from({ length: centers * DIM }, gaussian);
const vecs = new Float32Array(N_WORKS * DIM);
for (let i = 0; i < N_WORKS; i++) {
	const c = Math.floor(rand() * centers) * DIM;
	let norm = 0;
	for (let d = 0; d < DIM; d++) {
		const x = cents[c + d] + gaussian() * 1.2;
		vecs[i * DIM + d] = x;
		norm += x * x;
	}
	norm = Math.sqrt(norm);
	for (let d = 0; d < DIM; d++) vecs[i * DIM + d] /= norm;
}

const dot = (a: number, b: number) => {
	let s = 0;
	for (let d = 0; d < DIM; d++) s += vecs[a * DIM + d] * vecs[b * DIM + d];
	return s;
};
const centDot = (i: number, cent: Float32Array, c: number) => {
	let s = 0;
	for (let d = 0; d < DIM; d++) s += vecs[i * DIM + d] * cent[c * DIM + d];
	return s;
};
const top = (arr: { i: number; s: number }[], n: number) =>
	arr.sort((x, y) => y.s - x.s || x.i - y.i).slice(0, n);

// IVF build (k-means, 8 iters, fixed seed init)
const K = Math.max(4, Math.round(Math.sqrt(N_WORKS)));
const tB = performance.now();
const cent = new Float32Array(K * DIM);
for (let c = 0; c < K; c++)
	cent.set(vecs.subarray(c * DIM, c * DIM + DIM), c * DIM);
const assign = new Int32Array(N_WORKS);
for (let iter = 0; iter < 8; iter++) {
	for (let i = 0; i < N_WORKS; i++) {
		let best = Number.NEGATIVE_INFINITY;
		let bi = 0;
		for (let c = 0; c < K; c++) {
			const s = centDot(i, cent, c);
			if (s > best) {
				best = s;
				bi = c;
			}
		}
		assign[i] = bi;
	}
	cent.fill(0);
	const cnt = new Int32Array(K);
	for (let i = 0; i < N_WORKS; i++) {
		cnt[assign[i]]++;
		for (let d = 0; d < DIM; d++)
			cent[assign[i] * DIM + d] += vecs[i * DIM + d];
	}
	for (let c = 0; c < K; c++) {
		let norm = 0;
		for (let d = 0; d < DIM; d++) norm += cent[c * DIM + d] ** 2;
		norm = Math.sqrt(norm) || 1;
		for (let d = 0; d < DIM; d++) cent[c * DIM + d] /= norm;
	}
}
const lists: number[][] = Array.from({ length: K }, () => []);
for (let i = 0; i < N_WORKS; i++) lists[assign[i]].push(i);
const buildS = (performance.now() - tB) / 1000;

const NPROBE = 4;
const sampleQ = Array.from({ length: 50 }, () => Math.floor(rand() * N_WORKS));

const tE = performance.now();
const exact = new Map<number, Set<number>>();
for (const q of sampleQ) {
	const scores: { i: number; s: number }[] = [];
	for (let i = 0; i < N_WORKS; i++)
		if (i !== q) scores.push({ i, s: dot(q, i) });
	exact.set(q, new Set(top(scores, TOPN).map((x) => x.i)));
}
const exactMsQ = (performance.now() - tE) / sampleQ.length;

const tS = performance.now();
let hit = 0;
let tot = 0;
for (const q of sampleQ) {
	const cs: { i: number; s: number }[] = [];
	for (let c = 0; c < K; c++) cs.push({ i: c, s: centDot(q, cent, c) });
	const scores: { i: number; s: number }[] = [];
	for (const p of top(cs, NPROBE))
		for (const i of lists[p.i]) if (i !== q) scores.push({ i, s: dot(q, i) });
	const got = top(scores, TOPN);
	for (const e of exact.get(q) ?? []) {
		tot++;
		if (got.some((g) => g.i === e)) hit++;
	}
}
const ivfMsQ = (performance.now() - tS) / sampleQ.length;

console.log(
	`ivf k=${K} nprobe=${NPROBE}: build ${buildS.toFixed(1)}s | search ${ivfMsQ.toFixed(2)} ms/q ` +
		`(all works: ${((ivfMsQ * N_WORKS) / 1000).toFixed(0)}s) | recall@${TOPN} ${((hit / tot) * 100).toFixed(1)}%`,
);
console.log(
	`exact: ${exactMsQ.toFixed(1)} ms/q (all works: ${((exactMsQ * N_WORKS) / 60000).toFixed(1)} min) | RSS ${rss()}`,
);
console.log(
	`VERDICT @${N_WORKS}: ivf total ≈ ${(buildS + (ivfMsQ * N_WORKS) / 1000).toFixed(0)}s ` +
		`(budget: <60 min rebuild) | first embed ≈ ${((msPerText * N_WORKS) / 60000).toFixed(0)} min (budget: one-off, resumable)`,
);
