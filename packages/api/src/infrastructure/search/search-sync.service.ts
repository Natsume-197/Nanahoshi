import { searchSyncQueue } from "../queue/queues/search-sync.queue";
import { getSearchProvider } from "./search.factory";

export async function enqueueSearchSync(
	bookId: number,
	action: "create" | "update" | "delete",
): Promise<void> {
	if (!getSearchProvider().requiresSync()) return;

	await searchSyncQueue.add(
		`sync-${action}`,
		{ bookId, action },
		{
			jobId: `sync-${action}-${bookId}`,
			removeOnComplete: { age: 10 },
			removeOnFail: { count: 100 },
			attempts: action === "delete" ? 3 : 5,
			backoff: { type: "exponential", delay: 1000 },
		},
	);
}
