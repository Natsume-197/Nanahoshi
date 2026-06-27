import { fileEventQueue } from "../../infrastructure/queue/queues/file-event.queue";
import { logger } from "../../lib/logger";
import { calculateContentHash } from "../../utils/misc";
import { createTask, finalizeTask, reserve } from "../taskManager";

const log = logger.child({ component: "upload-service" });

export interface UploadedFile {
	/** Absolute path of the file already written to disk. */
	absolutePath: string;
	filename: string;
	/** Path relative to the library path root, forward-slashed. */
	relativePath: string;
	size: number;
	mtimeMs: number;
}

/**
 * Processes ebook files that the upload endpoint has already written to disk:
 * hashes each, enqueues a "file-event" add job (identical shape to the scanner's
 * ebookJobCreator) so the file-event worker creates the book, enriches metadata
 * and syncs search. A library-upload task tracks progress via the same SSE feed
 * as scans. Skips the full scan pipeline; the (library_id, filehash) unique index
 * is the dedupe safety net.
 */
export async function enqueueUploadedFiles(opts: {
	files: UploadedFile[];
	libraryId: number;
	libraryPathId: number;
	serverId: string;
	libraryName: string;
}): Promise<{ taskId: string }> {
	const { files, libraryId, libraryPathId, serverId, libraryName } = opts;

	const task = await createTask({
		type: "library-upload",
		serverId,
		label: `Uploading to ${libraryName}`,
	});

	const jobs: { name: string; data: Record<string, unknown> }[] = [];
	for (const file of files) {
		const fileHash = await calculateContentHash(file.absolutePath, file.size);
		if (!fileHash) {
			log.error({ path: file.absolutePath }, "Skipping: content hash failed");
			continue;
		}
		jobs.push({
			name: "file-event",
			data: {
				action: "add",
				mediaType: "ebook" as const,
				path: file.absolutePath,
				mtime: file.mtimeMs,
				size: file.size,
				filename: file.filename,
				relativePath: file.relativePath,
				lastModified: new Date(file.mtimeMs).toISOString(),
				fileHash,
				libraryId,
				libraryPathId,
				taskId: task.id,
			},
		});
	}

	// Reserve before enqueuing so the task can't transiently look complete while
	// jobs are still being added (mirrors createEbookJobs).
	if (jobs.length > 0) {
		await reserve(task.id, jobs.length);
		await fileEventQueue.addBulk(jobs);
	}

	await finalizeTask(task.id).catch((err) =>
		log.error({ err, taskId: task.id }, "Failed to finalize upload task"),
	);

	return { taskId: task.id };
}
