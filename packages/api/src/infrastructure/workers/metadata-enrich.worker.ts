import { type Job, Worker } from "bullmq";
import { TooManyRequestsError } from "../../errors";
import { logger } from "../../lib/logger";
import { workerConcurrency } from "../../lib/worker-budget";
import { enqueueBookRegroup } from "../../modules/duplicateGrouping";
import { admit } from "../../modules/metadataEnrichment/metadata-enrichment.admission";
import { dispatchDueMetadataRetries } from "../../modules/metadataRetry/metadata-retry.scheduler";
import { isTaskCancelled } from "../../modules/taskManager";
import { audiobookMetadataRepository } from "../../routers/audiobooks/metadata/metadata.repository";
import { audiobookMetadataService } from "../../routers/audiobooks/metadata/metadata.service";
import { bookMetadataRepository } from "../../routers/books/metadata/metadata.repository";
import { bookMetadataService } from "../../routers/books/metadata/metadata.service";
import { buildEnrichInput } from "../../routers/books/metadata/metadata.utils";
import { enrichmentStateRepository } from "../../routers/enrichment/enrichment.repository";
import { redis } from "../queue/redis";

const log = logger.child({ component: "metadata-enrich-worker" });

/**
 * Whether this job may run at all: the same gate for books and audiobooks, so
 * a new suppression rule lands in one place. Logs the reason and returns false
 * when the answer is no.
 */
async function admitted(
	bookId: number,
	{
		trigger,
		retryGeneration,
	}: { trigger: "explicit" | "automatic"; retryGeneration?: number },
	notFoundMessage: string,
): Promise<boolean> {
	const facts = await enrichmentStateRepository.admissionFacts(bookId);
	if (!facts) {
		log.warn({ bookId }, notFoundMessage);
		return false;
	}
	const admission = admit(facts, {
		trigger,
		...(retryGeneration != null && { retryGeneration }),
	});
	if (!admission.ok) {
		log.info({ bookId, reason: admission.reason }, "Enrichment not admitted");
		return false;
	}
	return true;
}

// Single-unit jobs: the progress listener counts them off the queue event
// stream, so the only counter concern here is short-circuiting on cancel.
async function enrichSingleBook(
	job: Job<{
		bookId: number;
		uuid: string;
		taskId?: string;
		force?: boolean;
		refresh?: boolean;
		retryGeneration?: number;
	}>,
) {
	const { bookId, uuid, taskId, force, refresh, retryGeneration } = job.data;

	try {
		if (taskId && (await isTaskCancelled(taskId))) return;

		const ok = await admitted(
			bookId,
			{
				trigger: force || refresh ? "explicit" : "automatic",
				...(retryGeneration != null && { retryGeneration }),
			},
			"Book not found for enrichment",
		);
		if (!ok) return;

		const row = await bookMetadataRepository.getEnrichRowByBookId(bookId);

		if (!row) {
			log.warn({ bookId }, "Book not found for enrichment");
			return;
		}

		const input = buildEnrichInput(
			bookId,
			uuid,
			row as Record<string, unknown>,
		);
		const result = await bookMetadataService.enrichFromProviders(
			input,
			undefined,
			{ refresh },
		);

		// Provider evidence may have changed. Reconciliation is a separate,
		// debounced job so database retries never repeat remote provider calls.
		await enqueueBookRegroup(bookId);

		log.info(
			{ uuid, result: result ? "updated" : "no changes" },
			"Enriched book",
		);
	} catch (error) {
		if (error instanceof TooManyRequestsError) {
			// The service already persisted nextRetryAt. BullMQ must not burn its
			// own attempts inside the provider's cooldown window.
			log.info({ uuid }, "Provider retry scheduled durably");
			return;
		}
		// Terminal failure is counted by the progress listener (retries excluded).
		log.warn({ err: error, uuid }, "Failed to enrich book");
		throw error;
	}
}

async function enrichSingleAudiobook(
	job: Job<{
		bookId: number;
		uuid: string;
		taskId?: string;
		force?: boolean;
		retryGeneration?: number;
	}>,
) {
	const { bookId, uuid, taskId, force, retryGeneration } = job.data;

	try {
		if (taskId && (await isTaskCancelled(taskId))) return;

		const ok = await admitted(
			bookId,
			{
				trigger: force ? "explicit" : "automatic",
				...(retryGeneration != null && { retryGeneration }),
			},
			"Audiobook not found for enrichment",
		);
		if (!ok) return;

		// Fetch audiobook metadata + authors from the DB
		const row = await audiobookMetadataRepository.getEnrichRowByBookId(bookId);
		const title = row?.title as string | null;

		if (!title) {
			log.warn({ uuid }, "Audiobook has no title, skipping enrichment");
			return;
		}

		const authors = (row?.authors ?? []) as { name: string }[];
		const asin = (row?.asin ?? null) as string | null;
		const filename = (row?.filename ?? null) as string | null;
		const duration = Number(row?.duration) || undefined;

		const result = await audiobookMetadataService.quickMatch({
			bookId,
			uuid,
			title,
			asin: asin ?? undefined,
			filename,
			authors: authors.length > 0 ? authors : undefined,
			duration,
		});

		log.info(
			{ uuid, result: result ? "matched" : "no match" },
			"Enriched audiobook",
		);
	} catch (error) {
		if (error instanceof TooManyRequestsError) {
			// The service already persisted nextRetryAt. BullMQ must not burn its
			// own attempts inside the provider's cooldown window.
			log.info({ uuid }, "Provider retry scheduled durably");
			return;
		}
		log.warn({ err: error, uuid }, "Failed to enrich audiobook");
		throw error;
	}
}

export const metadataEnrichWorker = new Worker(
	"metadata-enrich",
	async (job) => {
		if (job.name === "dispatch-due-retries") {
			await dispatchDueMetadataRetries();
		} else if (job.name === "enrich-audiobook") {
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
		concurrency: workerConcurrency(),
	},
);

metadataEnrichWorker.on("completed", (job) => {
	log.info({ jobId: job?.id }, "Completed metadata enrichment job");
});

metadataEnrichWorker.on("failed", (job, err) => {
	log.error({ err, jobId: job?.id }, "Failed metadata enrichment job");
});
