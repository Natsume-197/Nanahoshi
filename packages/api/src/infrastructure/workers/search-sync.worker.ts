import { type Job, Worker } from "bullmq";
import { redis } from "../queue/redis";
import {
	fetchAuthorForIndex,
	fetchBookForIndex,
	fetchSeriesForIndex,
} from "../search/search.document";
import { getSearchProvider } from "../search/search.factory";

const searchProvider = getSearchProvider();

async function handleBookSync(job: Job) {
	const { bookId, action } = job.data as {
		bookId: number;
		action: "create" | "update";
	};

	const doc = await fetchBookForIndex(bookId);
	if (!doc) {
		console.warn(
			`[SearchSync] Book ${bookId} not found in DB, skipping ${action}`,
		);
		return { bookId, action, status: "not_found" };
	}

	await searchProvider.indexBook(doc);
	return { bookId, action, status: "indexed" };
}

async function handleBookDelete(job: Job) {
	const { bookId } = job.data as { bookId: number };
	await searchProvider.deleteBook(String(bookId));
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
				console.warn(`[SearchSync] Unknown job name: ${job.name}`);
		}
	},
	{
		connection: redis,
		concurrency: 5,
	},
);

searchSyncWorker.on("completed", (job) => {
	if (job.attemptsMade > 0) {
		console.log(
			`[SearchSync] Job ${job.id} completed after ${job.attemptsMade + 1} attempts`,
		);
	}
});

searchSyncWorker.on("failed", (job, err) => {
	console.error(`[SearchSync] Job ${job?.id} failed:`, err.message);
});
