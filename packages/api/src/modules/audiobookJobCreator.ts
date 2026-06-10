import path from "node:path";
import { db } from "@nanahoshi-v2/db";
import { scannedFile } from "@nanahoshi-v2/db/schema/general";
import { and, eq, gt } from "drizzle-orm";
import { fileEventQueue } from "../infrastructure/queue/queues/file-event.queue";
import { incrementTotalJobs } from "./taskManager";

const JOB_BATCH_SIZE = 10000;

/**
 * Matches CD/Disc subfolder names that should be collapsed into the parent
 * audiobook folder. Follows the Audiobookshelf convention + Japanese variant.
 * Matches: "CD 1", "cd1", "Disc 2", "Disk 03", "disc 100", "ディスク1", etc.
 */
export const DISC_FOLDER_RE = /^(cd|dis[ck]|ディスク)\s*\d{1,3}$/i;

/**
 * Folder metadata hints extracted from the directory hierarchy.
 *
 * Follows the Audiobookshelf convention: the folder depth relative to
 * the library root determines what each level represents.
 *
 * For **directory-grouped** audiobooks (mp3, m4a, ogg, etc. in a folder):
 *   relPath = root-relative path to the folder containing audio files
 *   segments = relPath.split("/")
 *
 *   1 segment  → [Title]                  → title only
 *   2 segments → [Author, Title]          → author + title
 *   3 segments → [Author, Series, Title]  → author + series + title
 *
 * For **standalone .m4b** files (each file = 1 audiobook):
 *   relPath = root-relative path to the file itself
 *   segments = relPath.split("/")
 *   The last segment (filename) provides the title.
 *   Ancestor segments provide author/series:
 *
 *   1 segment  → [file.m4b]                        → no folder hints
 *   2 segments → [Folder, file.m4b]                 → folder = series (if siblings) or author
 *   3 segments → [Author, Folder, file.m4b]         → author + series
 *   4 segments → [Author, Series, Folder, file.m4b] → author + series (from depth 2)
 *
 * Series position is extracted from the "book segment" (title folder name
 * or filename) using common patterns like "Vol 1", "[1巻]", "Book 3", etc.
 */
export type FolderMetadata = {
	authorHint: string | null;
	seriesHint: string | null;
	seriesPositionHint: number | null;
};

export async function createAudiobookJobs(opts: {
	rootDir: string;
	libraryId: number;
	libraryPathId: number;
	taskId?: string;
}): Promise<number> {
	const { rootDir, libraryId, libraryPathId, taskId } = opts;

	// Fetch all verified files for this library path
	const allVerifiedFiles: (typeof scannedFile.$inferSelect)[] = [];
	let lastId = 0;

	while (true) {
		const files = await db
			.select()
			.from(scannedFile)
			.where(
				and(
					eq(scannedFile.status, "verified"),
					eq(scannedFile.libraryPathId, libraryPathId),
					gt(scannedFile.id, lastId),
				),
			)
			.orderBy(scannedFile.id)
			.limit(JOB_BATCH_SIZE);

		const lastFile = files.at(-1);
		if (!lastFile) break;
		lastId = lastFile.id;
		allVerifiedFiles.push(...files);
	}

	if (allVerifiedFiles.length === 0) return 0;

	// ── Grouping ────────────────────────────────────────────────────────────
	// .m4b files are self-contained audiobooks (with embedded chapters),
	// so each one is always treated as a standalone audiobook.
	// Other formats (mp3, m4a, ogg, etc.) are typically individual tracks/chapters
	// and get grouped by parent directory into a single audiobook.
	const STANDALONE_EXTENSIONS = new Set([".m4b"]);

	const audiobookGroups = new Map<
		string,
		(typeof scannedFile.$inferSelect)[]
	>();

	for (const file of allVerifiedFiles) {
		const normalizedFilePath = path.normalize(file.path);
		const ext = path.extname(normalizedFilePath).toLowerCase();

		if (STANDALONE_EXTENSIONS.has(ext)) {
			const group = audiobookGroups.get(normalizedFilePath) ?? [];
			group.push(file);
			audiobookGroups.set(normalizedFilePath, group);
			continue;
		}

		const relPath = path
			.relative(rootDir, normalizedFilePath)
			.replace(/\\/g, "/");

		const parts = relPath.split("/");
		let groupKey: string;

		if (parts.length === 1) {
			// File directly in root → standalone
			groupKey = normalizedFilePath;
		} else {
			// Group by parent directory, but collapse CD/Disc subfolders
			// into the grandparent (the actual audiobook folder).
			// E.g. "Author/Book/CD 1/track01.mp3" → group by "Author/Book"
			const parentDir = path.dirname(normalizedFilePath);
			const parentName = path.basename(parentDir);

			if (DISC_FOLDER_RE.test(parentName)) {
				// This is a disc subfolder — use grandparent as the audiobook
				groupKey = path.dirname(parentDir);
			} else {
				groupKey = parentDir;
			}
		}

		const group = audiobookGroups.get(groupKey) ?? [];
		group.push(file);
		audiobookGroups.set(groupKey, group);
	}

	// ── Sibling count for standalone .m4b ───────────────────────────────────
	// Count how many standalone .m4b files share the same parent directory.
	// When there are multiple, the parent folder likely represents a series.
	const standaloneDirCount = new Map<string, number>();
	for (const [groupKey, files] of audiobookGroups) {
		const first = files[0];
		if (!first) continue;
		const isStandalone =
			files.length === 1 && groupKey === path.normalize(first.path);
		if (isStandalone) {
			const parentDir = path.dirname(first.path);
			standaloneDirCount.set(
				parentDir,
				(standaloneDirCount.get(parentDir) ?? 0) + 1,
			);
		}
	}

	// ── Job creation ────────────────────────────────────────────────────────
	const jobBatch: {
		name: string;
		data: Record<string, unknown>;
	}[] = [];

	for (const [groupKey, files] of audiobookGroups) {
		const first = files[0];
		if (!first) continue;
		const isStandalone =
			files.length === 1 && groupKey === path.normalize(first.path);
		const dirPath = isStandalone ? path.dirname(first.path) : groupKey;
		const dirName = isStandalone
			? path.basename(first.path)
			: path.basename(groupKey);
		const relPath = path
			.relative(rootDir, isStandalone ? first.path : groupKey)
			.replace(/\\/g, "/");

		const combinedHash = files
			.map((f) => f.hash)
			.sort()
			.join("|");
		const totalSize = files.reduce((sum, f) => sum + f.size, 0);
		const latestMtime = new Date(
			Math.max(...files.map((f) => f.mtime.getTime())),
		);

		// Extract metadata hints from folder hierarchy
		const siblingCount = isStandalone
			? (standaloneDirCount.get(dirPath) ?? 0)
			: 0;
		const folderMeta = extractFolderMetadata(
			relPath,
			isStandalone,
			siblingCount,
		);

		jobBatch.push({
			name: "file-event",
			data: {
				action: "add-audiobook",
				mediaType: "audiobook" as const,
				dirPath,
				filename: dirName,
				relativePath: relPath,
				fileHash: combinedHash,
				size: totalSize,
				lastModified: latestMtime.toISOString(),
				libraryId,
				libraryPathId,
				taskId,
				folderAuthorHint: folderMeta.authorHint,
				folderSeriesHint: folderMeta.seriesHint,
				folderSeriesPositionHint: folderMeta.seriesPositionHint,
				audioFiles: files
					.map((f) => ({
						path: f.path,
						filename: path.basename(f.path),
						size: f.size,
						mtime: f.mtime.getTime(),
						hash: f.hash,
					}))
					.sort((a, b) => a.filename.localeCompare(b.filename)),
			},
		});
	}

	if (jobBatch.length > 0) {
		await fileEventQueue.addBulk(jobBatch);
		if (taskId) {
			await incrementTotalJobs(taskId, jobBatch.length);
		}
	}

	return jobBatch.length;
}

// ── Folder metadata extraction ──────────────────────────────────────────────

function extractFolderMetadata(
	relPath: string,
	isStandalone: boolean,
	standaloneSiblingCount: number,
): FolderMetadata {
	const segments = relPath.split("/").filter(Boolean);

	if (segments.length === 0) {
		return { authorHint: null, seriesHint: null, seriesPositionHint: null };
	}

	// Last segment = the "book identifier":
	//   - For directory-grouped: folder name (= title)
	//   - For standalone .m4b: filename (title comes from file/tags)
	const bookSegment = segments[segments.length - 1] ?? "";
	const ancestors = segments.slice(0, -1);

	let authorHint: string | null = null;
	let seriesHint: string | null = null;

	if (isStandalone) {
		// Standalone .m4b: ancestors are the folders above the file.
		// 0 ancestors → file in root, no hints
		// 1 ancestor  → series (if siblings) or author (if alone)
		// 2+ ancestors → author (first) + series (second)
		if (ancestors.length >= 2) {
			authorHint = ancestors[0] ?? null;
			seriesHint = ancestors[1] ?? null;
		} else if (ancestors.length === 1) {
			if (standaloneSiblingCount > 1) {
				seriesHint = ancestors[0] ?? null;
			} else {
				authorHint = ancestors[0] ?? null;
			}
		}
	} else {
		// Directory-grouped: ancestors are the folders above the audiobook folder.
		// The audiobook folder itself (bookSegment) is the title.
		// 0 ancestors → 1-level: just title
		// 1 ancestor  → 2-level: author + title
		// 2+ ancestors → 3-level: author + series + title
		if (ancestors.length >= 2) {
			authorHint = ancestors[0] ?? null;
			seriesHint = ancestors[1] ?? null;
		} else if (ancestors.length === 1) {
			authorHint = ancestors[0] ?? null;
		}
	}

	// Extract series position from the book segment (filename or folder name)
	const stem = bookSegment.replace(/\.[^.]+$/, "");
	let seriesPositionHint = extractPositionFromName(stem);

	// For standalone files, also try the immediate parent folder name
	// (handles: Author/Series/Vol 1 - Title/file.m4b)
	if (seriesPositionHint === null && isStandalone && ancestors.length > 0) {
		seriesPositionHint = extractPositionFromName(
			ancestors[ancestors.length - 1] ?? "",
		);
	}

	return { authorHint, seriesHint, seriesPositionHint };
}

/**
 * Try to extract a volume/position number from a name (filename or folder).
 * Handles patterns like:
 *   [1巻] 無職転生 1.m4b          → 1
 *   Vol. 3 - Title                → 3
 *   Book 12                       → 12
 *   Title - Volume 2              → 2
 *   第5巻 Title                   → 5
 *   1 - Wizards First Rule        → 1
 *   0.5 - Side Story              → 0 (integer only)
 *   上巻 / 前編                   → 1 (first part)
 *   下巻 / 後編                   → 2 (second part)
 *   中巻                          → 2 (middle volume in 上中下 set)
 */
function extractPositionFromName(name: string): number | null {
	// Numbered patterns (checked first — more precise)
	const numberedPatterns = [
		/\[(\d+)巻\]/, // [1巻]
		/第(\d+)巻/, // 第5巻
		/(\d+)巻/, // 1巻 (bare, without brackets)
		/[Vv]ol(?:ume)?\.?\s*(\d+)/, // Vol. 3, Volume 2
		/[Bb]ook\s+(\d+)/, // Book 12
		/^(\d+)\s*[-–.]\s*/, // Leading number: "1 - Title"
		/\s(\d+)\s*$/, // Trailing number: "Title 2"
	];

	for (const pattern of numberedPatterns) {
		const match = name.match(pattern);
		if (match?.[1]) {
			const num = Number.parseInt(match[1], 10);
			if (Number.isFinite(num) && num > 0) return num;
		}
	}

	// Japanese positional words (上/中/下, 前/後)
	// 上巻 (jōkan) = upper/first, 中巻 (chūkan) = middle, 下巻 (gekan) = lower/last
	// 前編 (zenpen) = first part, 後編 (kōhen) = second part
	// For 上中下 (3-part): 上=1, 中=2, 下=3
	// For 上下 (2-part): 上=1, 下=3 — gap at 2 but ordering is correct
	// For 前後 (2-part): 前=1, 後=2
	const positionalMap: [RegExp, number][] = [
		[/[（(]?上[）)]?巻?/, 1],
		[/[（(]?中[）)]?巻?/, 2],
		[/[（(]?下[）)]?巻?/, 3],
		[/前編/, 1],
		[/後編/, 2],
	];

	for (const [pattern, position] of positionalMap) {
		if (pattern.test(name)) return position;
	}

	return null;
}
