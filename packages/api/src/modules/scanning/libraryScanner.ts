import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@nanahoshi-v2/env/server";
import { logger } from "../../lib/logger";
import {
	scanHashConcurrency,
	scanStatConcurrency,
} from "../../lib/worker-budget";
import { bookRepository } from "../../routers/books/book.repository";
import { libraryRepository } from "../../routers/libraries/library.repository";
import { calculateContentHash, isCurrentHashFormat } from "../../utils/misc";
import type { ScanProgressPhase } from "../taskManager";
import { DISC_FOLDER_RE } from "./path-conventions";
import {
	type KnownScannedDirectory,
	scannedDirectoryRepository,
} from "./scannedDirectory.repository";
import {
	type KnownScannedFile,
	scannedFileRepository,
	type UpsertScannedFileRow,
} from "./scannedFile.repository";
import { scanRunRepository } from "./scanRun.repository";
import {
	AUDIOBOOK_EXTENSIONS,
	EBOOK_EXTENSIONS,
	type LibraryMediaType,
} from "./supportedExtensions";

const DB_BATCH_SIZE = env.SCAN_CHECKPOINT_ROWS ?? 500;
const CHECKPOINT_INTERVAL_MS = env.SCAN_CHECKPOINT_INTERVAL_MS ?? 30_000;
const DIRECTORY_CHECKPOINT_BATCH_SIZE = Math.min(DB_BATCH_SIZE, 100);
const DIRECTORY_CHECKPOINT_INTERVAL_MS = Math.min(
	CHECKPOINT_INTERVAL_MS,
	5_000,
);
const PARALLEL_STAT = scanStatConcurrency();
// Hashing samples ~64KB/file, so it's I/O-bound — scale parallelism with the host.
const PARALLEL_CONTENT_HASH = scanHashConcurrency();

async function throwIfScanTaskCancelled(taskId?: string): Promise<void> {
	if (!taskId) return;
	const { throwIfTaskCancelled } = await import("../taskManager");
	await throwIfTaskCancelled(taskId);
}

type KnownFile = KnownScannedFile;
export type LibraryScanMode = "incremental" | "full";

type Discovery = {
	seenPaths: Set<string>;
	skippedDirectoryPrefixes: string[];
	errors: Error[];
	metrics: DiscoveryMetrics;
};

export interface DiscoveryMetrics {
	stageDurationsMs: Record<
		"traversal" | "stat" | "hash" | "checkpoint",
		number
	>;
	peakInFlight: { stat: number; hash: number };
	effectiveConcurrency: { stat: number; hash: number };
	checkpointWrites: number;
	counts: ScanCounterDelta;
}

type DiscoveryStorage = {
	upsertFiles: (rows: UpsertScannedFileRow[]) => Promise<void>;
	rehashFiles: (rows: Array<{ path: string; hash: string }>) => Promise<void>;
	markSeen: (paths: string[]) => Promise<void>;
	checkpoint: (counters: ScanCounterDelta) => Promise<void>;
	completeDirectories: (directories: KnownScannedDirectory[]) => Promise<void>;
};

export type ScanCounterDelta = {
	discovered: number;
	statted: number;
	hashed: number;
	persisted: number;
	errors: number;
};

type DiscoveryExecution = {
	checkpointRows?: number;
	storage?: DiscoveryStorage;
	onDurableCheckpoint?: (counters: Readonly<ScanCounterDelta>) => Promise<void>;
};

function toRelativePath(root: string, absolutePath: string): string {
	return path.relative(root, path.normalize(absolutePath)).replace(/\\/g, "/");
}

// Scans one library path and reconciles `scanned_file` with the filesystem in
// five phases: discover (hash new/changed files → "pending"), prune (queue
// deletes for vanished files), dedupe (collapse same-hash files; ebooks only),
// promote ("pending"/"failed" → "verified"), enqueue ("add" jobs per verified file).
// Identity is the sampled content hash. NOTE: dedupe is library-wide, so two
// paths of one library must not scan concurrently.
export async function scanPathLibrary(
	rootDir: string,
	libraryId: number,
	libraryPathId: number,
	taskId?: string,
	mediaType: LibraryMediaType = "ebook",
	mode: LibraryScanMode = "incremental",
) {
	const root = path.normalize(rootDir);
	const scanStart = performance.now();
	const run = taskId
		? await scanRunRepository.startOrResume(taskId, libraryPathId, mode)
		: null;
	if (run?.status === "completed" || run?.status === "cancelled") return;
	let progressPhase: ScanProgressPhase = run?.phase ?? "discovery";
	const progressCounters: ScanCounterDelta = {
		discovered: run?.discoveredCount ?? 0,
		statted: run?.stattedCount ?? 0,
		hashed: run?.hashedCount ?? 0,
		persisted: run?.persistedCount ?? 0,
		errors: run?.errorCount ?? 0,
	};
	const publishProgress = async (force = false) => {
		if (!taskId || !run) return;
		try {
			const elapsedSeconds = Math.max(
				0.001,
				(Date.now() - (run.startedAt?.getTime?.() ?? Date.now())) / 1000,
			);
			const { reportScanProgress } = await import("../taskManager");
			await reportScanProgress(
				taskId,
				{
					phase: progressPhase,
					...progressCounters,
					statConcurrency: PARALLEL_STAT,
					hashConcurrency: PARALLEL_CONTENT_HASH,
					throughput: progressCounters.persisted / elapsedSeconds,
					lastProgressAt: Date.now(),
				},
				force,
			);
		} catch (err) {
			logger.warn({ err, taskId }, "Failed to project durable scan progress");
		}
	};
	const setPhase = async (phase: ScanProgressPhase) => {
		if (run) await scanRunRepository.setPhase(run.id, phase);
		progressPhase = phase;
		await publishProgress(true);
	};
	const logPhase = (phase: ScanProgressPhase, startedAt: number) => {
		logger.info(
			{
				event: "scan_phase_complete",
				phase,
				durationMs: Math.round(performance.now() - startedAt),
				counts: { ...progressCounters },
			},
			"Scan phase complete",
		);
	};

	try {
		// An unmounted disk looks like an empty directory; without this guard,
		// prune would treat it as "everything deleted" and wipe the catalog.
		try {
			await fs.access(root);
		} catch (cause) {
			throw new Error(
				`Library path is not accessible: ${root} — aborting scan so the catalog is not wiped`,
				{ cause },
			);
		}

		logger.info(
			{
				event: "scan_started",
				mode,
				mediaType,
				statConcurrency: PARALLEL_STAT,
				hashConcurrency: PARALLEL_CONTENT_HASH,
				checkpointRows: DB_BATCH_SIZE,
				checkpointIntervalMs: CHECKPOINT_INTERVAL_MS,
			},
			"Scanning library path",
		);

		// Cancellation checkpoints between (and inside) phases: every phase leaves
		// scanned_file self-healing state.
		await setPhase("discovery");
		logger.info("Phase 1: Discovering files...");
		const discoveryStartedAt = performance.now();
		const known = await loadKnownFiles(libraryPathId);
		const knownDirectories =
			await scannedDirectoryRepository.loadByLibraryPath(libraryPathId);
		const discovery = await discoverFiles(
			root,
			libraryPathId,
			known,
			mediaType,
			taskId,
			mode,
			new Map(knownDirectories.map((directory) => [directory.path, directory])),
			run?.id,
			{
				onDurableCheckpoint: async (delta) => {
					for (const key of Object.keys(delta) as Array<
						keyof ScanCounterDelta
					>) {
						progressCounters[key] += delta[key];
					}
					await publishProgress();
				},
			},
		);
		logPhase("discovery", discoveryStartedAt);
		if (discovery.errors.length > 0) {
			throw new AggregateError(
				discovery.errors,
				`Scan discovery incomplete for ${root}`,
			);
		}
		if (mode === "full" && run) {
			await scannedDirectoryRepository.pruneNotCompleted(libraryPathId, run.id);
		}

		await throwIfScanTaskCancelled(taskId);
		await setPhase("prune");
		logger.info("Phase 2: Pruning missing files...");
		const pruneStartedAt = performance.now();
		await pruneMissingFiles(
			root,
			libraryId,
			libraryPathId,
			known,
			discovery.seenPaths,
			discovery.skippedDirectoryPrefixes,
			mediaType,
			taskId,
			run?.id,
		);
		logPhase("prune", pruneStartedAt);

		await throwIfScanTaskCancelled(taskId);
		await setPhase("dedupe");
		const dedupeStartedAt = performance.now();
		if (mediaType === "audiobook") {
			logger.info("Phase 3: Skipping dedupe for audiobooks");
		} else {
			logger.info("Phase 3: Deduplicating by content hash...");
			await dedupeLibrary(libraryId, taskId);
		}
		logPhase("dedupe", dedupeStartedAt);

		await throwIfScanTaskCancelled(taskId);
		await setPhase("promote");
		logger.info("Phase 4: Promoting pending files...");
		const promoteStartedAt = performance.now();
		await scannedFileRepository.promotePending(libraryPathId);
		logPhase("promote", promoteStartedAt);

		await throwIfScanTaskCancelled(taskId);
		await setPhase("enqueue");
		logger.info("Phase 5: Creating jobs...");
		const enqueueStartedAt = performance.now();
		const jobsCreated =
			mediaType === "audiobook"
				? await (await import("./audiobookJobCreator")).createAudiobookJobs({
						rootDir: root,
						libraryId,
						libraryPathId,
						taskId,
					})
				: await (await import("./ebookJobCreator")).createEbookJobs({
						rootDir: root,
						libraryId,
						libraryPathId,
						taskId,
					});
		logPhase("enqueue", enqueueStartedAt);

		const elapsed = ((performance.now() - scanStart) / 1000).toFixed(2);
		const statusCounts =
			await scannedFileRepository.statusCounts(libraryPathId);

		logger.info(
			{
				visitedFiles: discovery.seenPaths.size,
				skippedDirectories: discovery.skippedDirectoryPrefixes.length,
				jobs: jobsCreated,
				statuses: Object.fromEntries(
					statusCounts.map(({ status, count }) => [status, count]),
				),
			},
			`Scan complete in ${elapsed}s`,
		);
		if (run) await scanRunRepository.complete(run.id);
		await publishProgress(true);
	} catch (error) {
		if (run) {
			if (error instanceof Error && error.name === "TaskCancelledError") {
				await scanRunRepository.cancel(run.id);
			} else {
				await scanRunRepository.fail(run.id, error);
			}
		}
		await publishProgress(true);
		throw error;
	}
}

/** Loads every scanned_file row of this library path, keyed by absolute path. */
async function loadKnownFiles(
	libraryPathId: number,
): Promise<Map<string, KnownFile>> {
	const rows = await scannedFileRepository.loadByLibraryPath(libraryPathId);

	return new Map(rows.map((row) => [row.path, row]));
}

// Walks the filesystem and syncs findings into scanned_file; returns the set of
// absolute paths on disk. New/changed files are hashed and upserted "pending";
// unchanged rows are left alone, except legacy size-only hashes get re-hashed.
async function discoverFiles(
	root: string,
	libraryPathId: number,
	known: Map<string, KnownFile>,
	mediaType: LibraryMediaType,
	taskId?: string,
	mode: LibraryScanMode = "incremental",
	knownDirectories = new Map<string, KnownScannedDirectory>(),
	scanRunId?: string,
	execution: DiscoveryExecution = {},
): Promise<Discovery> {
	const phaseStart = performance.now();
	const checkpointRows = execution.checkpointRows ?? DB_BATCH_SIZE;
	const seen = new Set<string>();
	const skippedDirectoryPrefixes: string[] = [];
	const errors: Error[] = [];
	let upserted = 0;
	let rehashed = 0;
	let lastCheckpointAt = Date.now();
	let lastDirectoryCheckpointAt = Date.now();
	const counters: ScanCounterDelta = {
		discovered: 0,
		statted: 0,
		hashed: 0,
		persisted: 0,
		errors: 0,
	};
	const metrics: DiscoveryMetrics = {
		stageDurationsMs: { traversal: 0, stat: 0, hash: 0, checkpoint: 0 },
		peakInFlight: { stat: 0, hash: 0 },
		effectiveConcurrency: {
			stat: PARALLEL_STAT,
			hash: PARALLEL_CONTENT_HASH,
		},
		checkpointWrites: 0,
		counts: { discovered: 0, statted: 0, hashed: 0, persisted: 0, errors: 0 },
	};
	let lastMetricsLogAt = Date.now();
	const addDuration = (
		stage: keyof DiscoveryMetrics["stageDurationsMs"],
		startedAt: number,
	) => {
		metrics.stageDurationsMs[stage] += performance.now() - startedAt;
	};
	const logMetrics = (force = false) => {
		const now = Date.now();
		if (!force && now - lastMetricsLogAt < CHECKPOINT_INTERVAL_MS) return;
		lastMetricsLogAt = now;
		const elapsedSeconds = Math.max(
			0.001,
			(performance.now() - phaseStart) / 1000,
		);
		logger.info(
			{
				event: "scan_stage_metrics",
				phase: "discovery",
				counts: {
					discovered: seen.size,
					upserted,
					rehashed,
					errors: errors.length,
				},
				stageDurationsMs: Object.fromEntries(
					Object.entries(metrics.stageDurationsMs).map(([key, value]) => [
						key,
						Math.round(value),
					]),
				),
				throughput: seen.size / elapsedSeconds,
				peakInFlight: metrics.peakInFlight,
				checkpointWrites: metrics.checkpointWrites,
				lastActivityAt: now,
			},
			"Scan discovery metrics",
		);
	};
	const productionStorage: DiscoveryStorage = {
		upsertFiles: (rows) => scannedFileRepository.upsertBatch(rows),
		rehashFiles: async (rows) => {
			await bookRepository.rehashFilehashBatch(
				libraryPathId,
				rows.map((value) => ({
					relativePath: toRelativePath(root, value.path),
					hash: value.hash,
				})),
			);
			await scannedFileRepository.rehashBatch(rows, libraryPathId, scanRunId);
		},
		markSeen: (paths) =>
			scanRunId
				? scannedFileRepository.markSeen(paths, libraryPathId, scanRunId)
				: Promise.resolve(),
		checkpoint: async (delta) => {
			if (scanRunId) await scanRunRepository.checkpoint(scanRunId, delta);
		},
		completeDirectories: (directories) =>
			scannedDirectoryRepository.upsertBatch(
				libraryPathId,
				directories,
				scanRunId,
			),
	};
	const storage = execution.storage ?? productionStorage;

	const upsertBatch: UpsertScannedFileRow[] = [];
	const rehashBatch: Array<{ path: string; hash: string }> = [];
	const seenBatch: string[] = [];
	const directoryBatch: KnownScannedDirectory[] = [];

	const flushCounters = async (_force = false) => {
		if (Object.values(counters).every((value) => value === 0)) return;
		const delta = { ...counters };
		const checkpointStartedAt = performance.now();
		await storage.checkpoint(delta);
		addDuration("checkpoint", checkpointStartedAt);
		metrics.checkpointWrites++;
		for (const key of Object.keys(delta) as Array<keyof ScanCounterDelta>) {
			metrics.counts[key] += delta[key];
		}
		await execution.onDurableCheckpoint?.(delta);
		counters.discovered = 0;
		counters.statted = 0;
		counters.hashed = 0;
		counters.persisted = 0;
		counters.errors = 0;
		lastCheckpointAt = Date.now();
		logMetrics();
	};

	const flushUpserts = async (limit = upsertBatch.length) => {
		if (upsertBatch.length === 0) return;
		const rows = upsertBatch.slice(0, limit);
		const checkpointStartedAt = performance.now();
		await storage.upsertFiles(rows);
		addDuration("checkpoint", checkpointStartedAt);
		metrics.checkpointWrites++;
		upsertBatch.splice(0, rows.length);
		upserted += rows.length;
		counters.persisted += rows.length;
	};

	const flushRehashes = async (limit = rehashBatch.length) => {
		if (rehashBatch.length === 0) return;
		const rows = rehashBatch.slice(0, limit);
		// Keep book.filehash in sync, or upload dedupe / duplicate grouping
		// would compare new-format hashes against stale ones.
		const checkpointStartedAt = performance.now();
		await storage.rehashFiles(rows);
		addDuration("checkpoint", checkpointStartedAt);
		metrics.checkpointWrites++;
		rehashBatch.splice(0, rows.length);
		rehashed += rows.length;
		counters.persisted += rows.length;
	};

	const flushSeen = async (limit = seenBatch.length) => {
		if (!scanRunId || seenBatch.length === 0) return;
		const paths = seenBatch.slice(0, limit);
		const checkpointStartedAt = performance.now();
		await storage.markSeen(paths);
		addDuration("checkpoint", checkpointStartedAt);
		metrics.checkpointWrites++;
		seenBatch.splice(0, paths.length);
		counters.persisted += paths.length;
	};

	const flushFileCheckpoints = async (force = false) => {
		while (upsertBatch.length > 0) await flushUpserts(checkpointRows);
		while (rehashBatch.length > 0) await flushRehashes(checkpointRows);
		while (seenBatch.length > 0) await flushSeen(checkpointRows);
		await flushCounters(force);
	};

	const flushDirectories = async () => {
		if (directoryBatch.length === 0) return;
		// A completed-directory marker is only durable after every file checkpoint
		// below it. A crash before this flush simply re-walks the bounded batch.
		await flushFileCheckpoints(true);
		const directories = directoryBatch.splice(0, directoryBatch.length);
		const checkpointStartedAt = performance.now();
		await storage.completeDirectories(directories);
		addDuration("checkpoint", checkpointStartedAt);
		metrics.checkpointWrites++;
		lastDirectoryCheckpointAt = Date.now();
		counters.persisted += directories.length;
		await flushCounters(true);
	};

	const flushAll = async (force = false) => {
		await flushFileCheckpoints(force);
		await flushDirectories();
	};

	const maybeCheckpoint = async () => {
		const buffered = upsertBatch.length + rehashBatch.length + seenBatch.length;
		if (buffered >= checkpointRows) {
			while (upsertBatch.length >= checkpointRows) {
				await flushUpserts(checkpointRows);
			}
			while (rehashBatch.length >= checkpointRows) {
				await flushRehashes(checkpointRows);
			}
			while (seenBatch.length >= checkpointRows) {
				await flushSeen(checkpointRows);
			}
			await flushCounters(true);
		} else if (Date.now() - lastCheckpointAt >= CHECKPOINT_INTERVAL_MS) {
			await flushAll(true);
		}
	};

	const processBatch = async (paths: string[]) => {
		// Discovery is the long phase (stat + hash of every new file); check
		// between batches so a cancel stops the walk within seconds.
		await throwIfScanTaskCancelled(taskId);
		metrics.peakInFlight.stat = Math.max(
			metrics.peakInFlight.stat,
			paths.length,
		);
		const statStartedAt = performance.now();
		const statted = await Promise.allSettled(
			paths.map(async (filePath) => ({
				filePath,
				stats: await fs.stat(filePath),
			})),
		);
		addDuration("stat", statStartedAt);

		const toHash: Array<{ filePath: string; size: number; mtime: Date }> = [];
		const toRehash: Array<{ filePath: string; size: number }> = [];

		for (const [index, result] of statted.entries()) {
			if (result.status === "rejected") {
				const filePath = paths[index];
				if (filePath) seen.add(filePath);
				const error = new Error(
					`Unable to stat file during scan: ${filePath}`,
					{
						cause: result.reason,
					},
				);
				errors.push(error);
				counters.errors++;
				logger.warn({ err: result.reason, filePath }, "Error stat'ing file");
				continue;
			}
			const { filePath, stats } = result.value;
			seen.add(filePath);
			counters.statted++;

			const prev = known.get(filePath);
			const mtime = new Date(stats.mtimeMs);
			const unchanged =
				prev !== undefined &&
				prev.size === stats.size &&
				prev.mtime.getTime() === mtime.getTime();

			if (!unchanged) {
				toHash.push({ filePath, size: stats.size, mtime });
			} else if (!isCurrentHashFormat(prev.hash)) {
				// Old hash format (legacy size-only or pre-SHA-256): re-hash in
				// place, keeping status so no jobs are re-created.
				toRehash.push({ filePath, size: prev.size });
			} else if (scanRunId && prev.lastSeenScanRunId !== scanRunId) {
				seenBatch.push(filePath);
			}
		}

		for (let i = 0; i < toHash.length; i += PARALLEL_CONTENT_HASH) {
			const chunk = toHash.slice(i, i + PARALLEL_CONTENT_HASH);
			metrics.peakInFlight.hash = Math.max(
				metrics.peakInFlight.hash,
				chunk.length,
			);
			const hashStartedAt = performance.now();
			const hashes = await Promise.allSettled(
				chunk.map((file) => calculateContentHash(file.filePath, file.size)),
			);
			addDuration("hash", hashStartedAt);
			chunk.forEach((file, j) => {
				const result = hashes[j];
				const hash = result?.status === "fulfilled" ? result.value : null;
				if (!hash) {
					errors.push(
						new Error(`Unable to hash file during scan: ${file.filePath}`, {
							cause: result?.status === "rejected" ? result.reason : undefined,
						}),
					);
					counters.errors++;
					return;
				}
				counters.hashed++;
				upsertBatch.push({
					path: file.filePath,
					libraryPathId,
					size: file.size,
					mtime: file.mtime,
					status: "pending",
					hash,
					lastSeenScanRunId: scanRunId,
				});
			});
		}

		for (let i = 0; i < toRehash.length; i += PARALLEL_CONTENT_HASH) {
			const chunk = toRehash.slice(i, i + PARALLEL_CONTENT_HASH);
			metrics.peakInFlight.hash = Math.max(
				metrics.peakInFlight.hash,
				chunk.length,
			);
			const hashStartedAt = performance.now();
			const hashed = await Promise.allSettled(
				chunk.map(async (file) => {
					const hash = await calculateContentHash(file.filePath, file.size);
					return { path: file.filePath, hash };
				}),
			);
			addDuration("hash", hashStartedAt);
			for (const result of hashed) {
				if (result.status === "fulfilled" && result.value.hash) {
					counters.hashed++;
					rehashBatch.push({
						path: result.value.path,
						hash: result.value.hash,
					});
				} else {
					const failedPath =
						result.status === "fulfilled" ? result.value.path : "unknown";
					errors.push(
						new Error(`Unable to hash file during scan: ${failedPath}`, {
							cause: result.status === "rejected" ? result.reason : undefined,
						}),
					);
					counters.errors++;
				}
			}
		}
		await maybeCheckpoint();
	};

	try {
		await walkFiles({
			directory: root,
			mediaType,
			knownDirectories,
			skipped: skippedDirectoryPrefixes,
			errors,
			processBatch,
			completeDirectory: async (directory) => {
				directoryBatch.push(directory);
				if (
					directoryBatch.length >= DIRECTORY_CHECKPOINT_BATCH_SIZE ||
					Date.now() - lastDirectoryCheckpointAt >=
						DIRECTORY_CHECKPOINT_INTERVAL_MS
				) {
					await flushDirectories();
				}
			},
			mode,
			scanRunId,
			seen,
			counters,
			isRoot: true,
			ancestorRealpaths: new Set(),
			reachedViaSymlink: false,
			metrics,
		});
	} finally {
		await flushAll(true);
	}

	const elapsed = ((performance.now() - phaseStart) / 1000).toFixed(2);
	logMetrics(true);
	logger.info(
		{ files: seen.size, upserted, rehashed },
		`Discovered ${seen.size.toLocaleString()} files in ${elapsed}s`,
	);
	return {
		seenPaths: seen,
		skippedDirectoryPrefixes,
		errors,
		metrics,
	};
}

/**
 * Runs the production discovery implementation with read-only source access and
 * injected no-op persistence. Used by the benchmark so its stage timings cannot
 * drift to a second traversal/stat/hash algorithm.
 */
export async function benchmarkScanDiscovery(
	rootDir: string,
	mediaType: LibraryMediaType = "ebook",
	checkpointRows = DB_BATCH_SIZE,
): Promise<{
	metrics: DiscoveryMetrics;
	files: Array<{ path: string; size: number }>;
}> {
	const files: Array<{ path: string; size: number }> = [];
	const noOpStorage: DiscoveryStorage = {
		upsertFiles: async (rows) => {
			files.push(...rows.map((row) => ({ path: row.path, size: row.size })));
		},
		rehashFiles: async () => {},
		markSeen: async () => {},
		checkpoint: async () => {},
		completeDirectories: async () => {},
	};
	const discovery = await discoverFiles(
		path.normalize(rootDir),
		0,
		new Map(),
		mediaType,
		undefined,
		"full",
		new Map(),
		undefined,
		{ checkpointRows, storage: noOpStorage },
	);
	if (discovery.errors.length > 0) {
		throw new AggregateError(
			discovery.errors,
			`Benchmark discovery incomplete for ${rootDir}`,
		);
	}
	return { metrics: discovery.metrics, files };
}

function supportsMediaFile(
	filename: string,
	mediaType: LibraryMediaType,
): boolean {
	const extension = path.extname(filename).slice(1).toLowerCase();
	return (mediaType === "audiobook" ? AUDIOBOOK_EXTENSIONS : EBOOK_EXTENSIONS)
		.map((value) => value.toLowerCase())
		.includes(extension);
}

type WalkFilesOptions = {
	directory: string;
	mediaType: LibraryMediaType;
	knownDirectories: Map<string, KnownScannedDirectory>;
	skipped: string[];
	errors: Error[];
	processBatch: (paths: string[]) => Promise<void>;
	completeDirectory: (directory: KnownScannedDirectory) => Promise<void>;
	mode: LibraryScanMode;
	scanRunId?: string;
	seen: Set<string>;
	counters: {
		discovered: number;
		statted: number;
		hashed: number;
		persisted: number;
		errors: number;
	};
	isRoot: boolean;
	ancestorRealpaths: ReadonlySet<string>;
	resolvedDirectory?: string;
	reachedViaSymlink: boolean;
	metrics: DiscoveryMetrics;
};

/**
 * The only filesystem traversal used by discovery. A directory checkpoint is
 * written after all supported files and child directories have completed.
 */
async function walkFiles(options: WalkFilesOptions): Promise<boolean> {
	const {
		directory,
		mediaType,
		knownDirectories,
		skipped,
		errors,
		processBatch,
		completeDirectory,
		mode,
		scanRunId,
		seen,
		counters,
		isRoot,
		ancestorRealpaths,
		resolvedDirectory,
		reachedViaSymlink,
		metrics,
	} = options;
	let stats: Awaited<ReturnType<typeof fs.stat>>;
	let traversalStartedAt = performance.now();
	try {
		stats = await fs.stat(directory);
	} catch (err) {
		metrics.stageDurationsMs.traversal +=
			performance.now() - traversalStartedAt;
		logger.warn({ err, directory }, "Unable to stat directory during scan");
		skipped.push(directory);
		counters.errors++;
		errors.push(
			new Error(`Unable to stat directory during scan: ${directory}`, {
				cause: err,
			}),
		);
		return false;
	}
	metrics.stageDurationsMs.traversal += performance.now() - traversalStartedAt;
	const mtimeMs = Math.round(stats.mtimeMs);
	const previous = knownDirectories.get(directory);
	if (
		scanRunId &&
		previous?.completedScanRunId === scanRunId &&
		previous.mtimeMs === mtimeMs
	) {
		return true;
	}
	if (!isRoot && mode === "incremental" && previous?.mtimeMs === mtimeMs) {
		skipped.push(directory);
		// This subtree is trusted from the advisory cache, not observed by this
		// run. Do not stamp its ancestors with the current run id: a retry must
		// reconstruct this protected prefix before prune.
		return false;
	}

	let realDirectory = resolvedDirectory;
	if (isRoot || reachedViaSymlink) {
		traversalStartedAt = performance.now();
		try {
			realDirectory = await fs.realpath(directory);
		} catch (err) {
			metrics.stageDurationsMs.traversal +=
				performance.now() - traversalStartedAt;
			logger.warn(
				{ err, directory },
				"Unable to resolve directory during scan",
			);
			skipped.push(directory);
			counters.errors++;
			errors.push(
				new Error(`Unable to resolve directory during scan: ${directory}`, {
					cause: err,
				}),
			);
			return false;
		}
		metrics.stageDurationsMs.traversal +=
			performance.now() - traversalStartedAt;
	}
	if (!realDirectory) {
		throw new Error(`Missing resolved directory identity for ${directory}`);
	}
	if (ancestorRealpaths.has(realDirectory)) {
		// A directory symlink points back into its own ancestry. Protect anything
		// previously catalogued below the alias and do not recurse forever.
		skipped.push(directory);
		logger.warn(
			{ directory, realDirectory },
			"Skipping directory symlink cycle",
		);
		return false;
	}
	const childAncestorRealpaths = new Set(ancestorRealpaths);
	childAncestorRealpaths.add(realDirectory);

	let entries: Dirent<string>[];
	traversalStartedAt = performance.now();
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (err) {
		metrics.stageDurationsMs.traversal +=
			performance.now() - traversalStartedAt;
		logger.warn({ err, directory }, "Unable to read directory during scan");
		skipped.push(directory);
		counters.errors++;
		errors.push(
			new Error(`Unable to read directory during scan: ${directory}`, {
				cause: err,
			}),
		);
		return false;
	}
	metrics.stageDurationsMs.traversal += performance.now() - traversalStartedAt;
	const files: string[] = [];
	const children: Array<{ path: string; isSymlink: boolean }> = [];
	for (const entry of entries) {
		// Match fast-glob's previous `dot: false` behavior for both files and
		// whole subtrees, including hidden symlink aliases.
		if (entry.name.startsWith(".")) continue;
		const absolutePath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			children.push({ path: absolutePath, isSymlink: false });
		} else if (entry.isFile() && supportsMediaFile(entry.name, mediaType)) {
			files.push(absolutePath);
			seen.add(absolutePath);
			counters.discovered++;
		} else if (entry.isSymbolicLink()) {
			traversalStartedAt = performance.now();
			try {
				const target = await fs.stat(absolutePath);
				metrics.stageDurationsMs.traversal +=
					performance.now() - traversalStartedAt;
				if (target.isDirectory()) {
					children.push({ path: absolutePath, isSymlink: true });
				} else if (
					target.isFile() &&
					supportsMediaFile(entry.name, mediaType)
				) {
					files.push(absolutePath);
					seen.add(absolutePath);
					counters.discovered++;
				}
			} catch (err) {
				metrics.stageDurationsMs.traversal +=
					performance.now() - traversalStartedAt;
				logger.warn({ err, path: absolutePath }, "Unable to follow symlink");
				skipped.push(absolutePath);
				counters.errors++;
				errors.push(
					new Error(`Unable to follow symlink during scan: ${absolutePath}`, {
						cause: err,
					}),
				);
			}
		}
	}
	for (let offset = 0; offset < files.length; offset += PARALLEL_STAT) {
		await processBatch(files.slice(offset, offset + PARALLEL_STAT));
	}
	let completed = true;
	for (const child of children) {
		const childCompleted = await walkFiles({
			...options,
			directory: child.path,
			isRoot: false,
			ancestorRealpaths: childAncestorRealpaths,
			reachedViaSymlink: child.isSymlink,
			resolvedDirectory: child.isSymlink
				? undefined
				: path.join(realDirectory, path.basename(child.path)),
		});
		if (!childCompleted) completed = false;
	}
	if (completed) {
		await completeDirectory({
			path: directory,
			mtimeMs,
			completedScanRunId: scanRunId ?? null,
		});
	}
	return completed;
}

// Removes rows whose file vanished and queues "delete" events. Directory-grouped
// audiobooks store their book at the folder path, so when a folder loses all
// audio files an extra delete event is queued for the folder itself.
async function pruneMissingFiles(
	root: string,
	libraryId: number,
	libraryPathId: number,
	known: Map<string, KnownFile>,
	seenPaths: Set<string>,
	skippedDirectoryPrefixes: string[],
	mediaType: LibraryMediaType,
	taskId?: string,
	scanRunId?: string,
) {
	const skippedDirectories = new Set(skippedDirectoryPrefixes);
	const missingPaths = [...known.values()]
		.filter((row) =>
			scanRunId
				? row.lastSeenScanRunId !== scanRunId && !seenPaths.has(row.path)
				: !seenPaths.has(row.path),
		)
		.map((row) => row.path)
		.filter((p) => !isBelowSkippedDirectory(p, skippedDirectories));
	if (missingPaths.length === 0) {
		logger.info("No missing files");
		return;
	}

	logger.info(`Found ${missingPaths.length} missing files`);

	const deleteTargets = missingPaths.map((p) => ({
		path: p,
		root,
		libraryPathId,
	}));

	if (mediaType === "audiobook") {
		const survivorPaths = new Set(seenPaths);
		if (scanRunId) {
			for (const row of known.values()) {
				if (row.lastSeenScanRunId === scanRunId) survivorPaths.add(row.path);
			}
		}
		deleteTargets.push(
			...findEmptyAudiobookFolders(
				root,
				missingPaths,
				survivorPaths,
				skippedDirectories,
			).map((dir) => ({ path: dir, root, libraryPathId })),
		);
	}

	await enqueueDeleteEvents(deleteTargets, libraryId, mediaType, taskId);

	for (let i = 0; i < missingPaths.length; i += DB_BATCH_SIZE) {
		const batch = missingPaths.slice(i, i + DB_BATCH_SIZE);
		await scannedFileRepository.deleteByPaths(batch, libraryPathId);
	}
}

/**
 * Check ancestors instead of testing every skipped prefix for every catalog
 * file. On a large, mostly unchanged library this is O(files × depth), not
 * O(files × skipped-directories).
 */
function isBelowSkippedDirectory(
	filePath: string,
	skippedDirectories: ReadonlySet<string>,
): boolean {
	if (skippedDirectories.size === 0) return false;
	let directory = path.dirname(filePath);
	for (;;) {
		if (skippedDirectories.has(directory)) return true;
		const parent = path.dirname(directory);
		if (parent === directory) return false;
		directory = parent;
	}
}

// Audiobook folders that lost every audio file this scan. Disc subfolders
// ("CD 1"…) collapse into their parent, mirroring audiobookJobCreator.
function findEmptyAudiobookFolders(
	root: string,
	missingPaths: string[],
	seenPaths: Set<string>,
	skippedDirectories: ReadonlySet<string>,
): string[] {
	const candidateDirs = new Set<string>();
	for (const missingPath of missingPaths) {
		let dir = path.dirname(missingPath);
		if (DISC_FOLDER_RE.test(path.basename(dir))) {
			dir = path.dirname(dir);
		}
		if (dir !== root) {
			candidateDirs.add(dir);
		}
	}

	return [...candidateDirs].filter((dir) => {
		const prefix = dir + path.sep;
		for (const survivor of seenPaths) {
			if (survivor.startsWith(prefix)) return false;
		}
		// Files below a skipped directory were deliberately not inspected this
		// incremental scan, so that directory proves nothing about emptiness.
		for (const skipped of skippedDirectories) {
			if (skipped === dir || skipped.startsWith(prefix)) return false;
		}
		return true;
	});
}

// Library-wide dedupe: group scanned files by content hash, keep one canonical
// per group (prefer one with an existing book, oldest first; else lowest id),
// mark the rest "duplicate" and queue deletes for any that created a book.
// Orphaned "duplicate" rows whose canonical vanished reset to "pending".
async function dedupeLibrary(libraryId: number, taskId?: string) {
	const roots = await libraryRepository.listPathsByLibrary(libraryId);
	if (roots.length === 0) return;

	const rootByPathId = new Map(
		roots.map((r) => [r.id, path.normalize(r.path)]),
	);
	const pathIds = roots.map((r) => r.id);

	// Hashes appearing more than once anywhere in the library
	const duplicateHashes = await scannedFileRepository.duplicateHashes(pathIds);

	// Every member of a duplicate group, plus rows previously marked
	// "duplicate" (their canonical may be gone by now)
	const rows = await scannedFileRepository.rowsInDuplicateGroups(
		pathIds,
		duplicateHashes,
	);

	if (rows.length === 0) {
		logger.info("No duplicates found");
		return;
	}

	// Which of these files already have a book in the catalog?
	const candidates = rows.map((row) => {
		const root = rootByPathId.get(row.libraryPathId);
		return {
			row,
			relativePath: root ? toRelativePath(root, row.path) : null,
		};
	});
	const candidateRelPaths = candidates
		.map((c) => c.relativePath)
		.filter((p): p is string => p !== null);
	const books = await bookRepository.findByRelativePaths(
		libraryId,
		candidateRelPaths,
	);
	const bookIdByFile = new Map(
		books.map((b) => [
			`${b.libraryPathId}:${(b.relativePath ?? "").replace(/\\/g, "/")}`,
			b.id,
		]),
	);

	const byHash = new Map<string, typeof candidates>();
	for (const candidate of candidates) {
		const group = byHash.get(candidate.row.hash) ?? [];
		group.push(candidate);
		byHash.set(candidate.row.hash, group);
	}

	const toPending: number[] = [];
	const toDuplicate: number[] = [];
	const booksToDelete: Array<{
		path: string;
		root: string;
		libraryPathId: number;
	}> = [];

	for (const group of byHash.values()) {
		const members = group.map((c) => ({
			...c,
			bookId:
				c.relativePath !== null
					? bookIdByFile.get(`${c.row.libraryPathId}:${c.relativePath}`)
					: undefined,
		}));
		const canonical =
			members
				.filter((m) => m.bookId !== undefined)
				.sort((a, b) => (a.bookId ?? 0) - (b.bookId ?? 0))[0] ?? members[0];

		for (const member of members) {
			if (member === canonical) {
				// A recovered orphan goes back through the pipeline
				if (member.row.status === "duplicate") toPending.push(member.row.id);
				continue;
			}
			if (member.row.status !== "duplicate") toDuplicate.push(member.row.id);
			if (member.bookId !== undefined) {
				const root = rootByPathId.get(member.row.libraryPathId);
				if (root) {
					booksToDelete.push({
						path: member.row.path,
						root,
						libraryPathId: member.row.libraryPathId,
					});
				}
			}
		}
	}

	for (let i = 0; i < toDuplicate.length; i += DB_BATCH_SIZE) {
		await scannedFileRepository.markDuplicate(
			toDuplicate.slice(i, i + DB_BATCH_SIZE),
		);
	}
	for (let i = 0; i < toPending.length; i += DB_BATCH_SIZE) {
		await scannedFileRepository.markPending(
			toPending.slice(i, i + DB_BATCH_SIZE),
		);
	}
	if (booksToDelete.length > 0) {
		await enqueueDeleteEvents(booksToDelete, libraryId, "ebook", taskId);
	}

	const groupCount = [...byHash.values()].filter((g) => g.length > 1).length;
	logger.info(
		{
			groups: groupCount,
			markedDuplicate: toDuplicate.length,
			recovered: toPending.length,
			booksQueuedForDeletion: booksToDelete.length,
		},
		"Dedupe complete",
	);
}

// Queues "delete" file events; the worker removes the book at each relative path
// (search index, orphaned authors/series included).
async function enqueueDeleteEvents(
	files: Array<{ path: string; root: string; libraryPathId: number }>,
	libraryId: number,
	mediaType: LibraryMediaType,
	taskId?: string,
) {
	const jobs = files.map((file) => ({
		name: "file-event",
		data: {
			action: "delete",
			path: file.path,
			filename: path.basename(file.path),
			relativePath: toRelativePath(file.root, file.path),
			libraryId,
			libraryPathId: file.libraryPathId,
			mediaType,
			taskId,
		},
	}));

	await (await import("./scan-queue-producer")).enqueueScanJobs(jobs, taskId);
}
