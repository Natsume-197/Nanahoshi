import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import { workerConcurrency } from "../../lib/worker-budget";
import { redis } from "../queue/redis";
import {
	fetchAudiobookForIndex,
	fetchAuthorForIndex,
	fetchBookForIndex,
	fetchSeriesForIndex,
} from "../search/search.document";
import { getSearchProvider } from "../search/search.factory";

const log = logger.child({ component: "search-sync-worker" });

const searchProvider = getSearchProvider();

async function handleBookSync(job: Job) {
	const { bookId, action } = job.data as {
		bookId: number;
		action: "create" | "update";
	};

	// Try ebook first, then audiobook
	const bookDoc = await fetchBookForIndex(bookId);
	if (bookDoc) {
		await searchProvider.indexBook(bookDoc);
		return { bookId, action, status: "indexed", type: "book" };
	}

	const audiobookDoc = await fetchAudiobookForIndex(bookId);
	if (audiobookDoc) {
		await searchProvider.indexAudiobook(audiobookDoc);
		return { bookId, action, status: "indexed", type: "audiobook" };
	}

	log.warn({ bookId, action }, "Book not found in DB, skipping");
	return { bookId, action, status: "not_found" };
}

async function handleBookDelete(job: Job) {
	const { bookId } = job.data as { bookId: number };
	// Delete from both indexes — the one where it doesn't exist is a no-op
	await Promise.all([
		searchProvider.deleteBook(String(bookId)),
		searchProvider.deleteAudiobook(String(bookId)),
	]);
	return { bookId, action: "delete", status: "deleted" };
}

async function handleSeriesSync(job: Job) {
	const { seriesId } = job.data as { seriesId: number };
	const doc = await fetchSeriesForIndex(seriesId);

	if (doc && (doc.bookCount as number) > 1) {
		await searchProvider.indexSeries(doc);
		return { seriesId, status: "indexed" };
	}

	await searchProvider.deleteSeries(String(seriesId));
	return { seriesId, status: "deleted" };
}

async function handleAuthorSync(job: Job) {
	const { authorId } = job.data as { authorId: number };
	const doc = await fetchAuthorForIndex(authorId);

	if (doc && (doc.bookCount as number) > 0) {
		await searchProvider.indexAuthor(doc);
		return { authorId, status: "indexed" };
	}

	await searchProvider.deleteAuthor(String(authorId));
	return { authorId, status: "deleted" };
}

export const searchSyncWorker = new Worker(
	"search-sync",
	async (job) => {
		switch (job.name) {
			case "sync-create":
			case "sync-update":
				return handleBookSync(job);
			case "sync-delete":
				return handleBookDelete(job);
			case "sync-series":
				return handleSeriesSync(job);
			case "sync-author":
				return handleAuthorSync(job);
			default:
				log.warn({ jobName: job.name }, "Unknown job name");
		}
	},
	{
		connection: redis,
		concurrency: workerConcurrency(5),
	},
);

searchSyncWorker.on("completed", (job) => {
	if (job.attemptsMade > 0) {
		log.info(
			{ jobId: job.id, attempts: job.attemptsMade + 1 },
			"Job completed after retries",
		);
	}
});

searchSyncWorker.on("failed", (job, err) => {
	log.error({ err, jobId: job?.id }, "Job failed");
});
