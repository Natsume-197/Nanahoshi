// Reproducible local EPUB-processing benchmark. It builds representative EPUBs
// in a temporary directory and measures the same LocalProvider path used by
// file-event jobs, without requiring Postgres or Redis.
//
// Run: bun run scan:benchmark
// Real library: SCAN_BENCH_REAL_RUNS=3 SCAN_BENCH_SAMPLE=16 bun run scan:benchmark --library=/path/to/books

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import sharp from "sharp";

const RUNS = Number(process.env.SCAN_BENCH_RUNS ?? 16);
const REAL_LIBRARY_RUNS = Number(process.env.SCAN_BENCH_REAL_RUNS ?? 3);
const REAL_LIBRARY_SAMPLE_SIZE = Number(process.env.SCAN_BENCH_SAMPLE ?? 16);
const DISCOVERY_RUNS = Number(process.env.SCAN_BENCH_DISCOVERY_RUNS ?? 2);
const PAGES = 48;
const IMAGE_PAGE_MARKUP_BYTES = 256 * 1024;
const libraryArg = process.argv.find((arg) => arg.startsWith("--library="));
const libraryPath = libraryArg?.slice("--library=".length);
const scanOnly = process.argv.includes("--scan-only");
const scratchDir = await fs.mkdtemp(
	path.join(os.tmpdir(), "nanahoshi-scan-bench-"),
);
const originalCwd = process.cwd();
process.chdir(scratchDir);

// libraryScanner imports the validated server environment. These inert values
// keep this read-only benchmark self-contained; no DB or Redis call is made.
process.env.CORS_ORIGIN ??= "http://localhost";
process.env.NAMESPACE_UUID ??= "00000000-0000-4000-8000-000000000000";
process.env.DOWNLOAD_SECRET ??= "00000000-0000-4000-8000-000000000001";
process.env.SERVER_URL ??= "http://localhost";
process.env.BETTER_AUTH_URL ??= "http://localhost";
process.env.BETTER_AUTH_SECRET ??= "benchmark-only-secret-000000000000";

const { LocalProvider } = await import(
	"../src/routers/books/metadata/providers/local.provider"
);
const { acquireCover, ingestCover } = await import("../src/lib/cover-store");
const { ensureCoverVariant, warmCoverVariants } = await import(
	"../src/lib/cover-cache"
);
const {
	coverLadder,
	DEFERRED_WARM_WIDTHS,
	masterWidthFromFilename,
	WARM_QUALITY,
	WARM_WIDTHS,
} = await import("../src/lib/cover-ladder");
const FULL_WARM_WIDTHS = [...WARM_WIDTHS, ...DEFERRED_WARM_WIDTHS];
const { extractDominantColor } = await import(
	"../src/infrastructure/workers/cover-color"
);
const { configureImageConcurrency } = await import(
	"../src/lib/image-concurrency"
);
const { benchmarkScanDiscovery } = await import(
	"../src/modules/scanning/libraryScanner"
);

type FixtureKind = "declared-prose" | "undeclared-prose" | "undeclared-images";

function packageDocument(kind: FixtureKind): string {
	const layout =
		kind === "declared-prose"
			? '<meta property="rendition:layout">reflowable</meta>'
			: "";
	const manifest = [
		'<item id="cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>',
		...Array.from(
			{ length: PAGES },
			(_, i) =>
				`<item id="p${i}" href="text/p${i}.xhtml" media-type="application/xhtml+xml"/>`,
		),
		...Array.from(
			{ length: PAGES },
			(_, i) =>
				`<item id="i${i}" href="images/i${i}.jpg" media-type="image/jpeg"/>`,
		),
	].join("");
	return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Benchmark ${kind}</dc:title><dc:creator>Nanahoshi</dc:creator>
    <dc:language>en</dc:language>${layout}
  </metadata>
  <manifest>${manifest}</manifest>
  <spine>${Array.from({ length: PAGES }, (_, i) => `<itemref idref="p${i}"/>`).join("")}</spine>
</package>`;
}

function page(kind: FixtureKind, index: number): string {
	// A page-image EPUB can still carry bulky SVG/layout markup. Keep it inside
	// a comment so it has zero visible text, but make it deliberately hard for
	// deflate to shrink; this exercises decompression and text stripping rather
	// than benchmarking a 70-byte document.
	let markup = "";
	if (kind === "undeclared-images") {
		let state = index + 1;
		for (let i = 0; i < IMAGE_PAGE_MARKUP_BYTES; i++) {
			state = (state * 1664525 + 1013904223) >>> 0;
			markup += String.fromCharCode(97 + (state % 26));
		}
		markup = `<!--${markup}-->`;
	}
	const body =
		kind === "undeclared-images"
			? `<img src="../images/i${index}.jpg"/>${markup}`
			: "あ".repeat(4_000);
	return `<html><head><title>Ignored</title></head><body>${body}</body></html>`;
}

async function createFixture(kind: FixtureKind): Promise<string> {
	const cover = await sharp({
		create: {
			width: 1200,
			height: 1800,
			channels: 3,
			background: { r: 90, g: 45, b: 170 },
		},
	})
		.jpeg({ quality: 92 })
		.toBuffer();
	const files: Record<string, Uint8Array> = {
		mimetype: strToU8("application/epub+zip"),
		"META-INF/container.xml": strToU8(
			'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
		),
		"OEBPS/content.opf": strToU8(packageDocument(kind)),
		"OEBPS/images/cover.jpg": cover,
	};
	for (let i = 0; i < PAGES; i++) {
		files[`OEBPS/text/p${i}.xhtml`] = strToU8(page(kind, i));
		files[`OEBPS/images/i${i}.jpg`] = cover;
	}
	const fixturePath = path.join(scratchDir, `${kind}.epub`);
	await fs.writeFile(fixturePath, zipSync(files, { level: 6 }));
	return fixturePath;
}

async function createScanFixture(): Promise<string> {
	const root = path.join(scratchDir, "scan-smoke");
	for (let shelf = 0; shelf < 2; shelf++) {
		const directory = path.join(root, `shelf-${shelf}`);
		await fs.mkdir(directory, { recursive: true });
		for (let index = 0; index < 2; index++) {
			await fs.writeFile(
				path.join(directory, `book-${index}.epub`),
				new Uint8Array(64 * 1024).fill(shelf * 2 + index),
			);
		}
	}
	return root;
}

function percentile(values: number[], p: number): number {
	const index = Math.min(values.length - 1, Math.ceil(values.length * p) - 1);
	return [...values].sort((a, b) => a - b)[index] ?? 0;
}

async function measure(kind: FixtureKind, filePath: string): Promise<void> {
	const provider = new LocalProvider();
	const samples: number[] = [];
	for (let i = 0; i < RUNS; i++) {
		const started = performance.now();
		const metadata = await provider.getMetadata({
			bookId: i + 1,
			uuid: `${kind}-${i}`,
			filePath,
		});
		if (
			!metadata.cover ||
			metadata.contentForm !==
				(kind === "undeclared-images" ? "images" : "text")
		) {
			throw new Error(`Fixture ${kind} produced incorrect metadata`);
		}
		samples.push(performance.now() - started);
	}
	const sorted = [...samples].sort((a, b) => a - b);
	console.log(
		`${kind.padEnd(18)} median ${percentile(sorted, 0.5).toFixed(1)} ms | p95 ${percentile(sorted, 0.95).toFixed(1)} ms | mean ${(sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(1)} ms`,
	);
}

async function measureCoverPipeline(): Promise<void> {
	configureImageConcurrency("worker");
	const source = await sharp({
		create: {
			width: 2400,
			height: 3600,
			channels: 3,
			background: { r: 90, g: 45, b: 170 },
		},
	})
		.jpeg({ quality: 92 })
		.toBuffer();
	const samples: number[] = [];

	for (let i = 0; i < RUNS; i++) {
		const started = performance.now();
		const acquired = await acquireCover(source, `cover-${i}`, ".jpg");
		if (!acquired) throw new Error("Cover acquisition failed");
		const master = await ingestCover(acquired, `cover-${i}`);
		const servePath = master?.path ?? acquired;
		const absolutePath = path.resolve(servePath);
		await extractDominantColor(absolutePath);
		const warmed = await warmCoverVariants(absolutePath);
		if (warmed.failed > 0) throw new Error("Cover warming failed");
		samples.push(performance.now() - started);
	}

	const sorted = [...samples].sort((a, b) => a - b);
	console.log(
		`cover ingest (one job) median ${percentile(sorted, 0.5).toFixed(1)} ms | p95 ${percentile(sorted, 0.95).toFixed(1)} ms | mean ${(sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(1)} ms`,
	);
}

type TimedBook = {
	duration: number;
	size: number;
	run: number;
	contentForm: string | null | undefined;
	coverPath: string | null | undefined;
};

function evenlySpaced<T>(items: T[], count: number): T[] {
	if (items.length <= count) return items;
	return Array.from({ length: count }, (_, index) => {
		const offset = Math.round((index * (items.length - 1)) / (count - 1));
		return items[offset] as T;
	});
}

function formatMiB(bytes: number): string {
	return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

type DiscoverySample = {
	label: "cold" | "warm";
	totalMs: number;
	result: Awaited<ReturnType<typeof benchmarkScanDiscovery>>;
};

async function measureDiscovery(
	root: string,
	runCount: number,
): Promise<DiscoverySample[]> {
	const samples: DiscoverySample[] = [];
	for (let run = 0; run < runCount; run++) {
		const started = performance.now();
		const result = await benchmarkScanDiscovery(root);
		const totalMs = performance.now() - started;
		const label = run === 0 ? "cold" : "warm";
		samples.push({ label, totalMs, result });
		const throughput =
			result.metrics.counts.discovered / Math.max(0.001, totalMs / 1000);
		console.log(
			`scan run=${run + 1} label=${label} files=${result.files.length} total_ms=${totalMs.toFixed(1)} throughput_files_per_second=${throughput.toFixed(1)}`,
		);
	}
	for (const stage of [
		"traversal",
		"stat",
		"hash",
		"checkpoint",
		"total",
	] as const) {
		const values =
			stage === "total"
				? samples.map((sample) => sample.totalMs)
				: samples.map(
						(sample) => sample.result.metrics.stageDurationsMs[stage],
					);
		console.log(
			`scan stage=${stage} p50_ms=${percentile(values, 0.5).toFixed(1)} p95_ms=${percentile(values, 0.95).toFixed(1)}`,
		);
	}
	const first = samples[0]?.result.metrics;
	console.log(
		`scan effective_concurrency stat=${first?.effectiveConcurrency.stat ?? 0} hash=${first?.effectiveConcurrency.hash ?? 0} peak_in_flight_stat=${Math.max(...samples.map((sample) => sample.result.metrics.peakInFlight.stat))} peak_in_flight_hash=${Math.max(...samples.map((sample) => sample.result.metrics.peakInFlight.hash))} checkpoint_writes=${first?.checkpointWrites ?? 0}`,
	);
	return samples;
}

type CoverTiming = {
	ingest: number;
	color: number;
	warm: number;
	total: number;
};

async function processRealCover(
	coverPath: string,
	warmWidths?: readonly number[],
): Promise<CoverTiming> {
	const totalStarted = performance.now();
	const key = path.basename(coverPath, path.extname(coverPath));
	const ingestStarted = performance.now();
	const master = await ingestCover(coverPath, key);
	const ingest = performance.now() - ingestStarted;
	const servePath = master?.path ?? coverPath;
	const absolutePath = path.resolve(servePath);
	const colorStarted = performance.now();
	await extractDominantColor(absolutePath);
	const color = performance.now() - colorStarted;
	const warmStarted = performance.now();
	if (!warmWidths) {
		const warmed = await warmCoverVariants(absolutePath);
		if (warmed.failed > 0) throw new Error("Real cover warming failed");
	} else {
		const widths = coverLadder(
			warmWidths,
			masterWidthFromFilename(path.basename(absolutePath)),
		);
		for (const width of widths) {
			await ensureCoverVariant({
				imagePath: absolutePath,
				width,
				quality: WARM_QUALITY,
				format: "avif",
			});
		}
	}
	return {
		ingest,
		color,
		warm: performance.now() - warmStarted,
		total: performance.now() - totalStarted,
	};
}

function formatCoverTiming(samples: CoverTiming[]): string {
	const median = (field: keyof CoverTiming) =>
		percentile(
			samples.map((sample) => sample[field]),
			0.5,
		).toFixed(1);
	const p95 = (field: keyof CoverTiming) =>
		percentile(
			samples.map((sample) => sample[field]),
			0.95,
		).toFixed(1);
	return `median ${median("total")} ms | p95 ${p95("total")} ms (master ${median("ingest")} ms, color ${median("color")} ms, warm ${median("warm")} ms)`;
}

async function measureRealCoverPipeline(timings: TimedBook[]): Promise<void> {
	const coverPaths = timings
		.filter((timing) => timing.run === 0)
		.map((timing) => timing.coverPath)
		.filter((coverPath): coverPath is string => Boolean(coverPath));
	if (coverPaths.length === 0) return;

	configureImageConcurrency("worker");
	const samples: CoverTiming[] = [];
	for (const coverPath of coverPaths)
		samples.push(await processRealCover(coverPath, FULL_WARM_WIDTHS));
	console.log(`real cover ingest ${formatCoverTiming(samples)}`);
}

async function measurePriorityWarm(timings: TimedBook[]): Promise<void> {
	const coverPaths = timings
		.filter((timing) => timing.run === 1)
		.map((timing) => timing.coverPath)
		.filter((coverPath): coverPath is string => Boolean(coverPath));
	if (coverPaths.length === 0) return;

	configureImageConcurrency("worker");
	const samples: CoverTiming[] = [];
	for (const coverPath of coverPaths) {
		samples.push(await processRealCover(coverPath, WARM_WIDTHS));
	}
	console.log(
		`priority warm (${WARM_WIDTHS.join("/")}) ${formatCoverTiming(samples)}`,
	);
}

async function measureCoverContention(timings: TimedBook[]): Promise<void> {
	const pathsForRun = (run: number) =>
		timings
			.filter((timing) => timing.run === run)
			.map((timing) => timing.coverPath)
			.filter((coverPath): coverPath is string => Boolean(coverPath))
			.slice(0, 4);
	const fourThreads = pathsForRun(2);
	const twoThreads = pathsForRun(3);
	if (fourThreads.length < 4 || twoThreads.length < 4) return;

	const workerThreads = configureImageConcurrency("worker");
	const measureBatch = async (paths: string[]) => {
		const started = performance.now();
		const samples = await Promise.all(
			paths.map((coverPath) => processRealCover(coverPath)),
		);
		return { elapsed: performance.now() - started, samples };
	};

	const four = await measureBatch(fourThreads);
	sharp.concurrency(Math.max(1, Math.floor(workerThreads / 2)));
	const two = await measureBatch(twoThreads);
	sharp.concurrency(workerThreads);
	console.log(
		`4 parallel jobs: ${workerThreads} threads/image ${four.elapsed.toFixed(1)} ms; ${Math.max(1, Math.floor(workerThreads / 2))} threads/image ${two.elapsed.toFixed(1)} ms`,
	);
	console.log(
		`parallel job timing @${workerThreads}: ${formatCoverTiming(four.samples)} | @${Math.max(1, Math.floor(workerThreads / 2))}: ${formatCoverTiming(two.samples)}`,
	);
}

async function measureRealLibrary(root: string): Promise<void> {
	const discovery = await measureDiscovery(root, REAL_LIBRARY_RUNS);
	const sized = (discovery[0]?.result.files ?? []).map((file) => ({
		filePath: file.path,
		size: file.size,
	}));
	if (sized.length === 0) throw new Error(`No EPUB files found under ${root}`);
	const sample = evenlySpaced(
		sized.sort((a, b) => a.size - b.size),
		Math.max(1, REAL_LIBRARY_SAMPLE_SIZE),
	);
	const provider = new LocalProvider();
	const timings: TimedBook[] = [];

	for (let run = 0; run < REAL_LIBRARY_RUNS; run++) {
		for (const [index, file] of sample.entries()) {
			const started = performance.now();
			const metadata = await provider.getMetadata({
				bookId: index + 1,
				uuid: `real-${run}-${index}`,
				filePath: file.filePath,
			});
			timings.push({
				duration: performance.now() - started,
				size: file.size,
				run,
				contentForm: metadata.contentForm,
				// Ingest one fresh extraction per sample; these files are all under
				// the scratch cwd, never beside the user's source EPUBs.
				coverPath: metadata.cover,
			});
		}
	}

	const durations = timings
		.map((timing) => timing.duration)
		.sort((a, b) => a - b);
	const withCover = timings.filter(
		(timing) => timing.run === 0 && timing.coverPath,
	).length;
	const imageForm = timings.filter(
		(timing) => timing.contentForm === "images",
	).length;
	const slowest = [...timings]
		.sort((a, b) => b.duration - a.duration)
		.slice(0, 3);
	console.log(
		`real library: ${sized.length} EPUBs; ${sample.length} size-stratified files × ${REAL_LIBRARY_RUNS} runs; sample ${formatMiB(sample[0]?.size ?? 0)}–${formatMiB(sample.at(-1)?.size ?? 0)}`,
	);
	console.log(
		`local extraction median ${percentile(durations, 0.5).toFixed(1)} ms | p95 ${percentile(durations, 0.95).toFixed(1)} ms | mean ${(durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(1)} ms | covers ${withCover}/${sample.length} | image form ${imageForm}/${timings.length}`,
	);
	console.log(
		`slowest samples ${slowest.map((timing) => `${timing.duration.toFixed(1)} ms @ ${formatMiB(timing.size)}`).join(", ")}`,
	);
	await measureRealCoverPipeline(timings);
	await measurePriorityWarm(timings);
	await measureCoverContention(timings);
}

try {
	if (scanOnly) {
		await measureDiscovery(
			libraryPath ? path.resolve(libraryPath) : await createScanFixture(),
			libraryPath ? REAL_LIBRARY_RUNS : DISCOVERY_RUNS,
		);
	} else if (libraryPath) {
		console.log(
			`Bun ${Bun.version}; real-library benchmark with ${REAL_LIBRARY_RUNS} runs per sampled EPUB`,
		);
		await measureRealLibrary(libraryPath);
	} else {
		console.log(
			`Bun ${Bun.version}; ${RUNS} fresh parses per fixture; ${PAGES} content documents`,
		);
		for (const kind of [
			"declared-prose",
			"undeclared-prose",
			"undeclared-images",
		] as const) {
			const fixturePath = await createFixture(kind);
			await measure(kind, fixturePath);
		}
		await measureDiscovery(scratchDir, DISCOVERY_RUNS);
		await measureCoverPipeline();
	}
} finally {
	process.chdir(originalCwd);
	await fs.rm(scratchDir, { recursive: true, force: true });
}
