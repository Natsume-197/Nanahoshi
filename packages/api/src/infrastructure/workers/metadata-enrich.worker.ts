import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import { regroupBookDuplicates } from "../../modules/duplicateGrouping";
import {
	finalizeTask,
	incrementCompleted,
	incrementFailed,
	incrementTotalJobs,
	isTaskCancelled,
	maybeFinalizeAutoEnrichTask,
} from "../../modules/taskManager";
import { audiobookMetadataRepository } from "../../routers/audiobooks/metadata/metadata.repository";
import { audiobookMetadataService } from "../../routers/audiobooks/metadata/metadata.service";
import { bookMetadataRepository } from "../../routers/books/metadata/metadata.repository";
import { bookMetadataService } from "../../routers/books/metadata/metadata.service";
import { buildEnrichInput } from "../../routers/books/metadata/metadata.utils";
import { redis } from "../queue/redis";

const log = logger.child({ component: "metadata-enrich-worker" });

const BATCH_SIZE = 20;

async function enrichSingleBook(
	job: Job<{ bookId: number; uuid: string; taskId?: string }>,
) {
	const { bookId, uuid, taskId } = job.data;

	try {
		if (taskId && (await isTaskCancelled(taskId))) {
			if (taskId) await incrementCompleted(taskId);
			return;
		}

		// Skip if already enriched from Amazon
		const alreadyEnriched =
			await bookMetadataRepository.isAmazonEnriched(bookId);
		if (alreadyEnriched) {
			if (taskId) await incrementCompleted(taskId);
			return;
		}

		const row = await bookMetadataRepository.getEnrichRowByBookId(bookId);

		if (!row) {
			log.warn({ bookId }, "Book not found for enrichment");
			if (taskId) await incrementCompleted(taskId);
			return;
		}

		// One source of truth: hidden copies aren't enriched. Only the canonical
		// is shown, so enriching duplicates would waste calls and let metadata
		// diverge between copies.
		if (row.duplicateOfBookId != null) {
			if (taskId) await incrementCompleted(taskId);
			return;
		}
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

		if (taskId) await incrementCompleted(taskId);
		log.info(
			{ uuid, result: result ? "updated" : "no changes" },
			"Enriched book",
		);
	} catch (error) {
		const attemptsLeft = (job.opts.attempts ?? 1) - job.attemptsMade;
		log.warn({ err: error, uuid, attemptsLeft }, "Failed to enrich book");
		// Only count as failed on the final attempt
		if (attemptsLeft <= 0 && taskId) {
			await incrementFailed(taskId);
		}
		throw error;
	}
}

async function enrichSingleAudiobook(
	job: Job<{ bookId: number; uuid: string; taskId?: string }>,
) {
	const { bookId, uuid, taskId } = job.data;

	try {
		if (taskId && (await isTaskCancelled(taskId))) {
			if (taskId) await incrementCompleted(taskId);
			return;
		}

		// Skip if already enriched from Audible
		const alreadyEnriched =
			await audiobookMetadataRepository.isAudibleEnriched(bookId);
		if (alreadyEnriched) {
			if (taskId) await incrementCompleted(taskId);
			return;
		}

		// Fetch audiobook metadata + authors from the DB
		const row = await audiobookMetadataRepository.getEnrichRowByBookId(bookId);
		const title = row?.title as string | null;

		if (!title) {
			log.warn({ uuid }, "Audiobook has no title, skipping enrichment");
			if (taskId) await incrementCompleted(taskId);
			return;
		}

		const authors = (row?.authors ?? []) as { name: string }[];

		const result = await audiobookMetadataService.quickMatch({
			bookId,
			uuid,
			title,
			authors: authors.length > 0 ? authors : undefined,
		});

		if (taskId) await incrementCompleted(taskId);
		log.info(
			{ uuid, result: result ? "matched" : "no match" },
			"Enriched audiobook",
		);
	} catch (error) {
		const attemptsLeft = (job.opts.attempts ?? 1) - job.attemptsMade;
		log.warn({ err: error, uuid, attemptsLeft }, "Failed to enrich audiobook");
		if (attemptsLeft <= 0 && taskId) {
			await incrementFailed(taskId);
		}
		throw error;
	}
}

async function enrichAllBooks(job: Job<{ taskId?: string }>) {
	const { taskId } = job.data;

	log.info("Starting metadata enrichment for all books");

	const totalBooks = await bookMetadataRepository.countAllBooks();

	if (taskId) {
		await incrementTotalJobs(taskId, totalBooks);
		// Total is final from here on: the counters can now finish the task
		await finalizeTask(taskId);
	}

	let lastId: number | null = null;
	let processed = 0;
	let enriched = 0;

	while (true) {
		if (taskId && (await isTaskCancelled(taskId))) {
			log.info("Metadata enrichment cancelled");
			break;
		}

		const books = await bookMetadataRepository.listEnrichRowsAfter(
			lastId,
			BATCH_SIZE,
		);

		if (books.length === 0) break;

		for (const row of books) {
			if (taskId && (await isTaskCancelled(taskId))) break;

			const bookId = row.id as number;
			const uuid = row.uuid as string;

			try {
				const input = buildEnrichInput(bookId, uuid, row);
				const result = await bookMetadataService.enrichFromAmazon(input);

				if (result) {
					enriched++;
				}
				if (taskId) await incrementCompleted(taskId);
			} catch (error) {
				log.warn({ err: error, uuid }, "Failed to enrich book");
				if (taskId) await incrementFailed(taskId);
			}

			processed++;
		}

		lastId = books.at(-1)?.id as number;
		await job.updateProgress(processed);
		log.info({ processed, totalBooks, enriched }, "Enrichment progress");
	}

	log.info({ processed, enriched }, "Metadata enrichment complete");
}

export const metadataEnrichWorker = new Worker(
	"metadata-enrich",
	async (job) => {
		if (job.name === "enrich-book") {
			return enrichSingleBook(job);
		}
		if (job.name === "enrich-audiobook") {
			return enrichSingleAudiobook(job);
		}
		return enrichAllBooks(job);
	},
	{
		connection: redis,
		concurrency: 1,
	},
);

metadataEnrichWorker.on("completed", (job) => {
	log.info({ jobId: job?.id }, "Completed metadata enrichment job");
});

metadataEnrichWorker.on("failed", (job, err) => {
	log.error({ err, jobId: job?.id }, "Failed metadata enrichment job");
});

// Backstop: if a scan was cancelled mid-flight, in-flight file events may
// have unsealed the auto-enrich task after the scan already finished. Once
// the queue drains with no scan running, seal it so it can complete.
metadataEnrichWorker.on("drained", () => {
	maybeFinalizeAutoEnrichTask().catch(() => {});
});
