import path from "node:path";
import type { scannedFile } from "@nanahoshi-v2/db/schema/general";
import { scanQueueBudget } from "../../lib/worker-budget";
import { planJobs, throwIfTaskCancelled } from "../taskManager";
import {
	compareAudiobookSources,
	createAudiobookSourceFingerprint,
} from "./audiobook-source-identity";
import { extractFolderMetadata } from "./audiobookFolderMetadata";
import { DISC_FOLDER_RE } from "./path-conventions";
import { enqueueScanJobs } from "./scan-queue-producer";
import { scannedFileRepository } from "./scannedFile.repository";

export async function createAudiobookJobs(opts: {
	rootDir: string;
	libraryId: number;
	libraryPathId: number;
	taskId?: string;
}): Promise<number> {
	const { rootDir, libraryId, libraryPathId, taskId } = opts;
	const { batchSize } = scanQueueBudget();

	// Fetch all verified files for this library path
	const allVerifiedFiles: (typeof scannedFile.$inferSelect)[] = [];
	let lastId = 0;

	while (true) {
		const files = await scannedFileRepository.listVerifiedAfter(
			libraryPathId,
			lastId,
			batchSize,
		);

		const lastFile = files.at(-1);
		if (!lastFile) break;
		lastId = lastFile.id;
		allVerifiedFiles.push(...files);
	}

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

	if (taskId) {
		await planJobs(taskId, `audiobook:${libraryPathId}`, audiobookGroups.size);
	}
	if (allVerifiedFiles.length === 0) return 0;

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

		const audioFiles = files
			.map((file) => ({
				path: file.path,
				filename: path.basename(file.path),
				size: file.size,
				mtime: file.mtime.getTime(),
				hash: file.hash,
			}))
			.sort(compareAudiobookSources);
		const combinedHash = createAudiobookSourceFingerprint(audioFiles);
		const totalSize = files.reduce((sum, f) => sum + f.size, 0);
		const latestMtime = new Date(
			Math.max(...files.map((f) => f.mtime.getTime())),
		);

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
				audioFiles,
			},
		});
	}

	if (jobBatch.length > 0) {
		await throwIfTaskCancelled(taskId);
		await enqueueScanJobs(jobBatch, taskId);
	}

	return jobBatch.length;
}
