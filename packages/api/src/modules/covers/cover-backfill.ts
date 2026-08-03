import { coverIngestQueue } from "../../infrastructure/queue/queues/cover-ingest.queue";
import { logger } from "../../lib/logger";
import { audiobookMetadataRepository } from "../../routers/audiobooks/metadata/metadata.repository";
import { bookMetadataRepository } from "../../routers/books/metadata/metadata.repository";
import { finalizeTask, reserve, throwIfTaskCancelled } from "../taskManager";

const log = logger.child({ component: "cover-backfill" });

const PAGE_SIZE = 500;

/**
 * Puts covers acquired before Cover Ingest existed through it.
 *
 * Until a cover has a master, it keeps exactly the behaviour it had before —
 * full-size bytes on disk and an untruncated ladder — so this is a catch-up
 * sweep rather than a migration anything depends on. It is also self-healing:
 * the query selects on the absence of a resolution marker, so a cancelled or
 * crashed run simply leaves the rest for the next one.
 */
export async function backfillCoverIngest(taskId?: string): Promise<number> {
	let enqueued = 0;
	try {
		for (const mediaType of ["ebook", "audiobook"] as const) {
			const repository =
				mediaType === "audiobook"
					? audiobookMetadataRepository
					: bookMetadataRepository;

			let afterBookId = 0;
			for (;;) {
				await throwIfTaskCancelled(taskId);

				const page = await repository.listUningestedCovers(
					afterBookId,
					PAGE_SIZE,
				);
				if (page.length === 0) break;
				afterBookId = page[page.length - 1]?.bookId ?? afterBookId;

				// Reserve before enqueuing so the task can't transiently look complete
				// while the producer is still creating jobs.
				if (taskId) await reserve(taskId, page.length);
				await coverIngestQueue.addBulk(
					page.map((row) => ({
						name: "ingest",
						data: {
							bookId: row.bookId,
							coverPath: row.cover,
							mediaType,
							taskId,
						},
						opts: {
							// One job per cover, however many times the sweep is re-run.
							jobId: `backfill-${mediaType}-${row.bookId}`,
							removeOnComplete: true,
							removeOnFail: 100,
						},
					})),
				);
				enqueued += page.length;
				log.info({ mediaType, enqueued }, "Cover ingest jobs queued");
			}
		}
	} finally {
		// Seal even on cancellation: the jobs already queued still have to count.
		if (taskId) await finalizeTask(taskId);
	}
	return enqueued;
}
