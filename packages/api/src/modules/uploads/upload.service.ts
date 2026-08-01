import { fileEventQueue } from "../../infrastructure/queue/queues/file-event.queue";
import { logger } from "../../lib/logger";
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
	/** Content hash computed (and dedupe-checked) by the upload endpoint. */
	fileHash: string;
}

/**
 * Enqueues a "file-event" add job (identical shape to the scanner's
 * ebookJobCreator) for each file the upload endpoint has already written to
 * disk, so the file-event worker creates the book, enriches metadata and syncs
 * search. A library-upload task tracks progress via the same SSE feed as scans.
 * Skips the full scan pipeline; the (library_id, filehash) unique index is the
 * dedupe safety net behind the endpoint's pre-write duplicate check.
 */
export async function enqueueUploadedFiles(opts: {
	files: UploadedFile[];
	libraryId: number;
	libraryPathId: number;
	serverId: string;
	libraryName: string;
	userId?: string;
}): Promise<{ taskId: string }> {
	const { files, libraryId, libraryPathId, serverId, libraryName } = opts;

	const task = await createTask({
		type: "library-upload",
		serverId,
		label: `Uploading to ${libraryName}`,
		userId: opts.userId,
		libraryId,
		payload: {
			files,
			libraryId,
			libraryPathId,
			serverId,
			libraryName,
		},
	});

	const jobs = files.map((file) => ({
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
			fileHash: file.fileHash,
			libraryId,
			libraryPathId,
			taskId: task.id,
		},
	}));

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
