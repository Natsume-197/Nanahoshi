import { Worker } from "bullmq";
import { redis } from "../queue/redis";
import { fetchBookForIndex } from "../search/search.document";
import { getSearchProvider } from "../search/search.factory";

const searchProvider = getSearchProvider();

export const searchSyncWorker = new Worker(
	"search-sync",
	async (job) => {
		const { bookId, action } = job.data as {
			bookId: number;
			action: "create" | "update" | "delete";
		};

		if (action === "delete") {
			await searchProvider.deleteBook(String(bookId));
			return { bookId, action, status: "deleted" };
		}

		// create or update
		const doc = await fetchBookForIndex(bookId);
		if (!doc) {
			console.warn(
				`[SearchSync] Book ${bookId} not found in DB, skipping ${action}`,
			);
			return { bookId, action, status: "not_found" };
		}

		await searchProvider.indexBook(doc);
		return { bookId, action, status: "indexed" };
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
