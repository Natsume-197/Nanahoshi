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
			removeOnComplete: true,
			removeOnFail: { count: 100 },
			attempts: action === "delete" ? 3 : 5,
			backoff: { type: "exponential", delay: 1000 },
		},
	);
}

async function enqueueEntitySync(
	type: "series" | "author",
	entityId: number,
): Promise<void> {
	await searchSyncQueue.add(
		`sync-${type}`,
		{ [`${type}Id`]: entityId },
		{
			jobId: `sync-${type}-${entityId}`,
			removeOnComplete: true,
			removeOnFail: { count: 100 },
			attempts: 3,
			backoff: { type: "exponential", delay: 1000 },
		},
	);
}

export async function enqueueSeriesSync(seriesId: number): Promise<void> {
	if (!getSearchProvider().requiresSync()) return;
	await enqueueEntitySync("series", seriesId);
}

export async function enqueueAuthorSync(authorId: number): Promise<void> {
	if (!getSearchProvider().requiresSync()) return;
	await enqueueEntitySync("author", authorId);
}

export async function enqueueBulkEntitySync(entities: {
	seriesIds: number[];
	authorIds: number[];
}): Promise<void> {
	if (!getSearchProvider().requiresSync()) return;

	await Promise.all([
		...entities.seriesIds.map((id) => enqueueEntitySync("series", id)),
		...entities.authorIds.map((id) => enqueueEntitySync("author", id)),
	]);
}
