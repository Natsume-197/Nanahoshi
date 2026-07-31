import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fg from "fast-glob";
import { fileEventQueue } from "../../infrastructure/queue/queues/file-event.queue";
import { logger } from "../../lib/logger";
import { bookRepository } from "../../routers/books/book.repository";
import { libraryRepository } from "../../routers/libraries/library.repository";
import { calculateContentHash, isCurrentHashFormat } from "../../utils/misc";
import { reserve, throwIfTaskCancelled } from "../taskManager";
import { createAudiobookJobs, DISC_FOLDER_RE } from "./audiobookJobCreator";
import { createEbookJobs } from "./ebookJobCreator";
import {
	type KnownScannedDirectory,
	scannedDirectoryRepository,
} from "./scannedDirectory.repository";
import {
	type KnownScannedFile,
	scannedFileRepository,
	type UpsertScannedFileRow,
} from "./scannedFile.repository";
import {
	AUDIOBOOK_EXTENSIONS,
	EBOOK_EXTENSIONS,
	type LibraryMediaType,
} from "./supportedExtensions";

const DB_BATCH_SIZE = 10_000;
const JOB_BATCH_SIZE = 10_000;
const PARALLEL_STAT = 200;
// Hashing samples ~64KB/file, so it's I/O-bound — scale parallelism with the host.
const PARALLEL_CONTENT_HASH = Math.max(64, os.cpus().length * 8);

type KnownFile = KnownScannedFile;
export type LibraryScanMode = "incremental" | "full";

type Discovery = {
	seenPaths: Set<string>;
	skippedDirectoryPrefixes: string[];
	directories: KnownScannedDirectory[];
};

function getGlobPatterns(mediaType: LibraryMediaType): string[] {
	const extensions =
		mediaType === "audiobook" ? AUDIOBOOK_EXTENSIONS : EBOOK_EXTENSIONS;
	return extensions.map((ext) => `**/*.${ext}`);
}

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

	// An unmounted disk looks like an empty directory to the glob; without this
	// guard, prune would treat it as "everything deleted" and wipe the catalog.
	try {
		await fs.access(root);
	} catch {
		throw new Error(
			`Library path is not accessible: ${root} — aborting scan so the catalog is not wiped`,
		);
	}

	logger.info({ mode }, `Scanning ${mediaType} library path: ${root}`);

	// Cancellation checkpoints between (and inside) phases: every phase leaves
	// scanned_file self-healing state — "pending" rows without jobs are promoted
	// and enqueued by the next scan — so aborting anywhere is safe.
	logger.info("Phase 1: Discovering files...");
	const known = await loadKnownFiles(libraryPathId);
	const knownDirectories =
		mode === "incremental"
			? await scannedDirectoryRepository.loadByLibraryPath(libraryPathId)
			: [];
	const discovery = await discoverFiles(
		root,
		libraryPathId,
		known,
		mediaType,
		taskId,
		mode,
		new Map(knownDirectories.map((directory) => [directory.path, directory])),
	);
	await scannedDirectoryRepository.upsertBatch(
		libraryPathId,
		discovery.directories,
	);
	if (mode === "full") {
		await scannedDirectoryRepository.pruneMissing(
			libraryPathId,
			discovery.directories.map((directory) => directory.path),
		);
	}

	await throwIfTaskCancelled(taskId);
	logger.info("Phase 2: Pruning missing files...");
	await pruneMissingFiles(
		root,
		libraryId,
		libraryPathId,
		known,
		discovery.seenPaths,
		discovery.skippedDirectoryPrefixes,
		mediaType,
		taskId,
	);

	await throwIfTaskCancelled(taskId);
	if (mediaType === "audiobook") {
		logger.info("Phase 3: Skipping dedupe for audiobooks");
	} else {
		logger.info("Phase 3: Deduplicating by content hash...");
		await dedupeLibrary(libraryId, taskId);
	}

	await throwIfTaskCancelled(taskId);
	logger.info("Phase 4: Promoting pending files...");
	await scannedFileRepository.promotePending(libraryPathId);

	await throwIfTaskCancelled(taskId);
	logger.info("Phase 5: Creating jobs...");
	const jobsCreated =
		mediaType === "audiobook"
			? await createAudiobookJobs({
					rootDir: root,
					libraryId,
					libraryPathId,
					taskId,
				})
			: await createEbookJobs({
					rootDir: root,
					libraryId,
					libraryPathId,
					taskId,
				});

	const elapsed = ((performance.now() - scanStart) / 1000).toFixed(2);
	const statusCounts = await scannedFileRepository.statusCounts(libraryPathId);

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
): Promise<Discovery> {
	const phaseStart = performance.now();
	const seen = new Set<string>();
	const skippedDirectoryPrefixes: string[] = [];
	const directories = new Map<string, KnownScannedDirectory>();
	let upserted = 0;
	let rehashed = 0;

	let upsertBatch: UpsertScannedFileRow[] = [];
	let rehashBatch: Array<{ path: string; hash: string }> = [];

	const flushUpserts = async () => {
		if (upsertBatch.length === 0) return;
		await scannedFileRepository.upsertBatch(upsertBatch);
		upserted += upsertBatch.length;
		upsertBatch = [];
	};

	const flushRehashes = async () => {
		if (rehashBatch.length === 0) return;
		await scannedFileRepository.rehashBatch(rehashBatch, libraryPathId);
		// Keep book.filehash in sync, or upload dedupe / duplicate grouping
		// would compare new-format hashes against stale ones.
		await bookRepository.rehashFilehashBatch(
			libraryPathId,
			rehashBatch.map((v) => ({
				relativePath: toRelativePath(root, v.path),
				hash: v.hash,
			})),
		);
		rehashed += rehashBatch.length;
		rehashBatch = [];
	};

	const processBatch = async (paths: string[]) => {
		// Discovery is the long phase (stat + hash of every new file); check
		// between batches so a cancel stops the walk within seconds.
		await throwIfTaskCancelled(taskId);
		const statted = await Promise.allSettled(
			paths.map(async (filePath) => ({
				filePath,
				stats: await fs.stat(filePath),
			})),
		);

		const toHash: Array<{ filePath: string; size: number; mtime: Date }> = [];
		const toRehash: Array<{ filePath: string; size: number }> = [];

		for (const result of statted) {
			if (result.status === "rejected") {
				logger.warn({ err: result.reason }, "Error stat'ing file");
				continue;
			}
			const { filePath, stats } = result.value;
			seen.add(filePath);

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
			}
		}

		for (let i = 0; i < toHash.length; i += PARALLEL_CONTENT_HASH) {
			const chunk = toHash.slice(i, i + PARALLEL_CONTENT_HASH);
			const hashes = await Promise.all(
				chunk.map((file) => calculateContentHash(file.filePath, file.size)),
			);
			chunk.forEach((file, j) => {
				const hash = hashes[j];
				// Unreadable files are left out of this scan; they stay in `seen`
				// so they are not pruned, and will be retried next scan.
				if (!hash) return;
				upsertBatch.push({
					path: file.filePath,
					libraryPathId,
					size: file.size,
					mtime: file.mtime,
					status: "pending",
					hash,
				});
			});
		}

		for (let i = 0; i < toRehash.length; i += PARALLEL_CONTENT_HASH) {
			const chunk = toRehash.slice(i, i + PARALLEL_CONTENT_HASH);
			const hashed = await Promise.all(
				chunk.map(async (file) => {
					const hash = await calculateContentHash(file.filePath, file.size);
					return hash ? { path: file.filePath, hash } : null;
				}),
			);
			for (const h of hashed) {
				if (h) rehashBatch.push(h);
			}
		}

		if (upsertBatch.length >= DB_BATCH_SIZE) {
			await flushUpserts();
		}
		if (rehashBatch.length >= DB_BATCH_SIZE) {
			await flushRehashes();
		}
	};

	const processPaths = async (entries: AsyncIterable<string>) => {
		let buffer: string[] = [];
		for await (const filePath of entries) {
			buffer.push(filePath);
			if (buffer.length >= PARALLEL_STAT) {
				await processBatch(buffer);
				buffer = [];
			}
		}
		if (buffer.length > 0) await processBatch(buffer);
	};

	if (mode === "incremental" && knownDirectories.size > 0) {
		await processPaths(
			walkChangedFiles(
				root,
				mediaType,
				knownDirectories,
				directories,
				skippedDirectoryPrefixes,
			),
		);
	} else {
		// The first incremental run deliberately walks everything to seed the
		// directory index. Full reconciliation always takes this path.
		const entries = fg.stream(getGlobPatterns(mediaType), {
			cwd: root,
			absolute: true,
			suppressErrors: true,
			onlyFiles: true,
			dot: false,
		});
		await processPaths(globPaths(entries));
		await collectDirectoryMtimes(root, directories);
	}
	await flushUpserts();
	await flushRehashes();

	const elapsed = ((performance.now() - phaseStart) / 1000).toFixed(2);
	logger.info(
		{ files: seen.size, upserted, rehashed },
		`Discovered ${seen.size.toLocaleString()} files in ${elapsed}s`,
	);
	return {
		seenPaths: seen,
		skippedDirectoryPrefixes,
		directories: [...directories.values()],
	};
}

async function* globPaths(
	entries: AsyncIterable<unknown>,
): AsyncGenerator<string> {
	for await (const entry of entries) yield String(entry);
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

/**
 * Walk only directory trees whose entry mtime changed. This is intentionally
 * advisory: callers choose it only for the fast scan mode; `full` still walks
 * the entire filesystem and is the correctness backstop for files overwritten
 * in place (which do not update their parent's mtime on every filesystem).
 */
async function* walkChangedFiles(
	directory: string,
	mediaType: LibraryMediaType,
	known: Map<string, KnownScannedDirectory>,
	observed: Map<string, KnownScannedDirectory>,
	skipped: string[],
	isRoot = true,
): AsyncGenerator<string> {
	let stats: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stats = await fs.stat(directory);
	} catch (err) {
		logger.warn({ err, directory }, "Unable to stat directory during scan");
		return;
	}
	const mtimeMs = Math.round(stats.mtimeMs);
	observed.set(directory, { path: directory, mtimeMs });
	if (!isRoot && known.get(directory)?.mtimeMs === mtimeMs) {
		skipped.push(directory);
		return;
	}

	let entries: Dirent<string>[];
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (err) {
		logger.warn({ err, directory }, "Unable to read directory during scan");
		return;
	}
	for (const entry of entries) {
		const absolutePath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			yield* walkChangedFiles(
				absolutePath,
				mediaType,
				known,
				observed,
				skipped,
				false,
			);
		} else if (entry.isFile() && supportsMediaFile(entry.name, mediaType)) {
			yield absolutePath;
		}
	}
}

async function collectDirectoryMtimes(
	root: string,
	observed: Map<string, KnownScannedDirectory>,
): Promise<void> {
	const directories = fg.stream("**", {
		cwd: root,
		absolute: true,
		onlyDirectories: true,
		dot: false,
		suppressErrors: true,
	});
	const paths = [root];
	for await (const entry of directories) paths.push(String(entry));
	for (let offset = 0; offset < paths.length; offset += PARALLEL_STAT) {
		const chunk = paths.slice(offset, offset + PARALLEL_STAT);
		const statted = await Promise.allSettled(
			chunk.map(async (directory) => ({
				directory,
				stats: await fs.stat(directory),
			})),
		);
		for (const result of statted) {
			if (result.status !== "fulfilled") continue;
			observed.set(result.value.directory, {
				path: result.value.directory,
				mtimeMs: Math.round(result.value.stats.mtimeMs),
			});
		}
	}
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
) {
	const skippedDirectories = new Set(skippedDirectoryPrefixes);
	const missingPaths = [...known.keys()].filter(
		(p) => !seenPaths.has(p) && !isBelowSkippedDirectory(p, skippedDirectories),
	);
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
		deleteTargets.push(
			...findEmptyAudiobookFolders(
				root,
				missingPaths,
				seenPaths,
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

	// Reserve before enqueuing so deletes count toward the scan's progress.
	if (taskId) await reserve(taskId, jobs.length);
	for (let i = 0; i < jobs.length; i += JOB_BATCH_SIZE) {
		await fileEventQueue.addBulk(jobs.slice(i, i + JOB_BATCH_SIZE));
	}
}
