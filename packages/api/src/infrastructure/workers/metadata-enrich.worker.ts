import os from "node:os";
import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import { regroupBookDuplicates } from "../../modules/duplicateGrouping";
import { isTaskCancelled } from "../../modules/taskManager";
import { audiobookMetadataRepository } from "../../routers/audiobooks/metadata/metadata.repository";
import { audiobookMetadataService } from "../../routers/audiobooks/metadata/metadata.service";
import { bookMetadataRepository } from "../../routers/books/metadata/metadata.repository";
import { bookMetadataService } from "../../routers/books/metadata/metadata.service";
import { buildEnrichInput } from "../../routers/books/metadata/metadata.utils";
import { redis } from "../queue/redis";

const log = logger.child({ component: "metadata-enrich-worker" });

// Single-unit jobs: the progress listener counts them off the queue event
// stream, so the only counter concern here is short-circuiting on cancel.
async function enrichSingleBook(
	job: Job<{ bookId: number; uuid: string; taskId?: string; force?: boolean }>,
) {
	const { bookId, uuid, taskId, force } = job.data;

	try {
		if (taskId && (await isTaskCancelled(taskId))) return;

		// "Enrich all" forces re-enrichment; auto/retry skip already-enriched.
		if (!force && (await bookMetadataRepository.isAmazonEnriched(bookId))) {
			return;
		}

		const row = await bookMetadataRepository.getEnrichRowByBookId(bookId);

		if (!row) {
			log.warn({ bookId }, "Book not found for enrichment");
			return;
		}

		// One source of truth: hidden copies aren't enriched. Only the canonical
		// is shown, so enriching duplicates would waste calls and let metadata
		// diverge between copies.
		if (row.duplicateOfBookId != null) return;

		const input = buildEnrichInput(
			bookId,
			uuid,
			row as Record<string, unknown>,
		);
		const result = await bookMetadataService.enrichFromAmazon(input);

		// Amazon may have just added an ISBN/ASIN — re-evaluate grouping.
		await regroupBookDuplicates(bookId).catch((err) =>
			log.error({ err, bookId }, "Regroup failed"),
		);

		log.info(
			{ uuid, result: result ? "updated" : "no changes" },
			"Enriched book",
		);
	} catch (error) {
		// Terminal failure is counted by the progress listener (retries excluded).
		log.warn({ err: error, uuid }, "Failed to enrich book");
		throw error;
	}
}

async function enrichSingleAudiobook(
	job: Job<{ bookId: number; uuid: string; taskId?: string }>,
) {
	const { bookId, uuid, taskId } = job.data;

	try {
		if (taskId && (await isTaskCancelled(taskId))) return;

		// Skip if already enriched from Audible
		const alreadyEnriched =
			await audiobookMetadataRepository.isAudibleEnriched(bookId);
		if (alreadyEnriched) return;

		// Fetch audiobook metadata + authors from the DB
		const row = await audiobookMetadataRepository.getEnrichRowByBookId(bookId);
		const title = row?.title as string | null;

		if (!title) {
			log.warn({ uuid }, "Audiobook has no title, skipping enrichment");
			return;
		}

		const authors = (row?.authors ?? []) as { name: string }[];

		const result = await audiobookMetadataService.quickMatch({
			bookId,
			uuid,
			title,
			authors: authors.length > 0 ? authors : undefined,
		});

		log.info(
			{ uuid, result: result ? "matched" : "no match" },
			"Enriched audiobook",
		);
	} catch (error) {
		log.warn({ err: error, uuid }, "Failed to enrich audiobook");
		throw error;
	}
}

export const metadataEnrichWorker = new Worker(
	"metadata-enrich",
	async (job) => {
		if (job.name === "enrich-audiobook") {
			await enrichSingleAudiobook(job);
		} else {
			await enrichSingleBook(job);
		}
		return { taskId: job.data?.taskId };
	},
	{
		connection: redis,
		// Amazon stays polite via its serialized gate, so parallelism here just
		// overlaps ranobedb/DB/cover work across books.
		concurrency: Math.max(4, os.cpus().length),
	},
);

metadataEnrichWorker.on("completed", (job) => {
	log.info({ jobId: job?.id }, "Completed metadata enrichment job");
});

metadataEnrichWorker.on("failed", (job, err) => {
	log.error({ err, jobId: job?.id }, "Failed metadata enrichment job");
});
