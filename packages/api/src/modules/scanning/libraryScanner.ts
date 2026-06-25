import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fg from "fast-glob";
import { fileEventQueue } from "../../infrastructure/queue/queues/file-event.queue";
import { logger } from "../../lib/logger";
import { bookRepository } from "../../routers/books/book.repository";
import { libraryRepository } from "../../routers/libraries/library.repository";
import { calculateContentHash, legacySizeHash } from "../../utils/misc";
import { reserve } from "../taskManager";
import { createAudiobookJobs, DISC_FOLDER_RE } from "./audiobookJobCreator";
import { createEbookJobs } from "./ebookJobCreator";
import {
	type KnownScannedFile,
	scannedFileRepository,
	type UpsertScannedFileRow,
} from "./scannedFile.repository";

// TODO: Add support to azw, mobi, pdf, cbz, cbr (maybe more?)
const EBOOK_EXTENSIONS = ["epub", "azw3"];
const AUDIOBOOK_EXTENSIONS = [
	"m4b",
	"m4a",
	"mp3",
	"ogg",
	"opus",
	"flac",
	"wma",
];

const DB_BATCH_SIZE = 10_000;
const JOB_BATCH_SIZE = 10_000;
const PARALLEL_STAT = 200;
// Hashing samples ~64KB/file, so it's I/O-bound — scale parallelism with the host.
const PARALLEL_CONTENT_HASH = Math.max(64, os.cpus().length * 8);

type LibraryMediaType = "ebook" | "audiobook";

type KnownFile = KnownScannedFile;

function getGlobPatterns(mediaType: LibraryMediaType): string[] {
	const extensions =
		mediaType === "audiobook" ? AUDIOBOOK_EXTENSIONS : EBOOK_EXTENSIONS;
	return extensions.map((ext) => `**/*.${ext}`);
}

function toRelativePath(root: string, absolutePath: string): string {
	return path.relative(root, path.normalize(absolutePath)).replace(/\\/g, "/");
}

/**
 * Scans one library path and reconciles the `scanned_file` table with the
 * filesystem. The pipeline runs five sequential phases:
 *
 *   1. discover — walk the filesystem; new or modified files (size or mtime
 *      changed) get a content hash and are upserted as "pending". Unchanged
 *      files are left alone.
 *   2. prune    — rows whose file no longer exists on disk are removed and a
 *      "delete" event is queued so the worker removes the book.
 *   3. dedupe   — files sharing the same content hash (library-wide) keep one
 *      canonical copy; the rest are marked "duplicate", and any book a
 *      duplicate already created is queued for deletion. Skipped for
 *      audiobooks, where identical audio files are legitimate.
 *   4. promote  — surviving "pending" rows become "verified".
 *   5. enqueue  — "add" jobs are created for every verified file.
 *
 * File identity is always the sampled content hash (calculateContentHash), so
 * hashes are comparable across scans and the (library_id, filehash) unique
 * index on `book` can act as a final safety net.
 *
 * NOTE: dedupe operates on the whole library, so two paths of the same
 * library must not be scanned concurrently.
 */
export async function scanPathLibrary(
	rootDir: string,
	libraryId: number,
	libraryPathId: number,
	taskId?: string,
	mediaType: LibraryMediaType = "ebook",
) {
	const root = path.normalize(rootDir);
	const scanStart = performance.now();

	// An unmounted disk or disconnected NAS looks like an empty directory to
	// the glob: without this guard, prune would interpret it as "every file
	// was deleted" and wipe the whole library from the catalog.
	try {
		await fs.access(root);
	} catch {
		throw new Error(
			`Library path is not accessible: ${root} — aborting scan so the catalog is not wiped`,
		);
	}

	logger.info(`Scanning ${mediaType} library path: ${root}`);

	logger.info("Phase 1: Discovering files...");
	const known = await loadKnownFiles(libraryPathId);
	const seenPaths = await discoverFiles(root, libraryPathId, known, mediaType);

	logger.info("Phase 2: Pruning missing files...");
	await pruneMissingFiles(
		root,
		libraryId,
		libraryPathId,
		known,
		seenPaths,
		mediaType,
		taskId,
	);

	if (mediaType === "audiobook") {
		logger.info("Phase 3: Skipping dedupe for audiobooks");
	} else {
		logger.info("Phase 3: Deduplicating by content hash...");
		await dedupeLibrary(libraryId, taskId);
	}

	logger.info("Phase 4: Promoting pending files...");
	await scannedFileRepository.promotePending(libraryPathId);

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
			files: seenPaths.size,
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

/**
 * Walks the filesystem and syncs what it finds into scanned_file. Returns the
 * set of absolute paths found on disk.
 *
 * New or modified files are content-hashed and upserted as "pending".
 * Unchanged files are not touched — except rows whose hash still comes from
 * the legacy size-only scheme: those are re-hashed in place (status kept) so
 * dedupe can compare every row by content.
 */
async function discoverFiles(
	root: string,
	libraryPathId: number,
	known: Map<string, KnownFile>,
	mediaType: LibraryMediaType,
): Promise<Set<string>> {
	const phaseStart = performance.now();
	const seen = new Set<string>();
	let upserted = 0;
	let rehashed = 0;

	let upsertBatch: UpsertScannedFileRow[] = [];

	const flushUpserts = async () => {
		if (upsertBatch.length === 0) return;
		await scannedFileRepository.upsertBatch(upsertBatch);
		upserted += upsertBatch.length;
		upsertBatch = [];
	};

	const processBatch = async (paths: string[]) => {
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
			} else if (prev.hash === legacySizeHash(prev.size)) {
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
			const valid = hashed.filter(
				(h): h is { path: string; hash: string } => h !== null,
			);
			if (valid.length > 0) {
				await scannedFileRepository.rehashBatch(valid, libraryPathId);
				rehashed += valid.length;
			}
		}

		if (upsertBatch.length >= DB_BATCH_SIZE) {
			await flushUpserts();
		}
	};

	const entries = fg.stream(getGlobPatterns(mediaType), {
		cwd: root,
		absolute: true,
		suppressErrors: true,
		onlyFiles: true,
		dot: false,
	});

	let buffer: string[] = [];
	for await (const entry of entries) {
		buffer.push(entry.toString());
		if (buffer.length >= PARALLEL_STAT) {
			await processBatch(buffer);
			buffer = [];
		}
	}
	if (buffer.length > 0) {
		await processBatch(buffer);
	}
	await flushUpserts();

	const elapsed = ((performance.now() - phaseStart) / 1000).toFixed(2);
	logger.info(
		{ files: seen.size, upserted, rehashed },
		`Discovered ${seen.size.toLocaleString()} files in ${elapsed}s`,
	);
	return seen;
}

/**
 * Removes rows whose file disappeared from disk and queues "delete" events so
 * the worker removes the corresponding books.
 *
 * Directory-grouped audiobooks store their book at the folder's relative path
 * (not at any audio file's), so per-file delete events never match them. When
 * a folder lost all of its audio files, an extra delete event is queued for
 * the folder itself.
 */
async function pruneMissingFiles(
	root: string,
	libraryId: number,
	libraryPathId: number,
	known: Map<string, KnownFile>,
	seenPaths: Set<string>,
	mediaType: LibraryMediaType,
	taskId?: string,
) {
	const missingPaths = [...known.keys()].filter((p) => !seenPaths.has(p));
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
			...findEmptyAudiobookFolders(root, missingPaths, seenPaths).map(
				(dir) => ({ path: dir, root, libraryPathId }),
			),
		);
	}

	await enqueueDeleteEvents(deleteTargets, libraryId, mediaType, taskId);

	for (let i = 0; i < missingPaths.length; i += DB_BATCH_SIZE) {
		const batch = missingPaths.slice(i, i + DB_BATCH_SIZE);
		await scannedFileRepository.deleteByPaths(batch, libraryPathId);
	}
}

/**
 * Returns the audiobook folders that lost every audio file in this scan.
 * Disc subfolders ("CD 1", "Disc 2"…) collapse into their parent, mirroring
 * how audiobookJobCreator derives the book's relative path.
 */
function findEmptyAudiobookFolders(
	root: string,
	missingPaths: string[],
	seenPaths: Set<string>,
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
		return true;
	});
}

/**
 * Library-wide duplicate detection. Groups every scanned file of the library
 * by content hash; each group keeps one canonical file — preferring the one
 * whose book already exists (oldest book first), falling back to the lowest
 * row id — and the rest are marked "duplicate". Duplicates that already
 * created a book (they slipped through in the past) get a "delete" event so
 * the worker cleans the catalog.
 *
 * Rows stuck as "duplicate" whose canonical disappeared are reset to
 * "pending" so they re-enter the pipeline and recreate the book.
 */
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

/**
 * Queues "delete" file events; for each one the worker removes the book at
 * that relative path (search index, orphaned authors/series included).
 */
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
