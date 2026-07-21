import { searchSyncQueue } from "../queue/queues/search-sync.queue";
import { getSearchProvider } from "./search.factory";

export function requiresSearchSync(): boolean {
	return getSearchProvider().requiresSync();
}

export async function enqueueSearchSync(
	bookId: number,
	action: "create" | "update" | "delete",
): Promise<void> {
	if (!requiresSearchSync()) return;

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

export async function enqueueSearchSyncBulk(
	bookIds: number[],
	action: "create" | "update" | "delete",
): Promise<void> {
	if (!requiresSearchSync()) return;

	const uniqueIds = [...new Set(bookIds)];
	const batchSize = 500;
	for (let i = 0; i < uniqueIds.length; i += batchSize) {
		await searchSyncQueue.addBulk(
			uniqueIds.slice(i, i + batchSize).map((bookId) => ({
				name: `sync-${action}`,
				data: { bookId, action },
				opts: {
					removeOnComplete: true,
					removeOnFail: { count: 100 },
					attempts: action === "delete" ? 3 : 5,
					backoff: { type: "exponential" as const, delay: 1000 },
				},
			})),
		);
	}
}

async function enqueueEntitySync(
	type: "series" | "author",
	entityId: number,
	options?: { deduplicate?: boolean },
): Promise<void> {
	await searchSyncQueue.add(
		`sync-${type}`,
		{ [`${type}Id`]: entityId },
		{
			...(options?.deduplicate === false
				? {}
				: { jobId: `sync-${type}-${entityId}` }),
			removeOnComplete: true,
			removeOnFail: { count: 100 },
			attempts: 3,
			backoff: { type: "exponential", delay: 1000 },
		},
	);
}

export async function enqueueSeriesSync(
	seriesId: number,
	options?: { deduplicate?: boolean },
): Promise<void> {
	if (!requiresSearchSync()) return;
	await enqueueEntitySync("series", seriesId, options);
}

export async function enqueueAuthorSync(
	authorId: number,
	options?: { deduplicate?: boolean },
): Promise<void> {
	if (!requiresSearchSync()) return;
	await enqueueEntitySync("author", authorId, options);
}

export async function enqueueBulkEntitySync(entities: {
	seriesIds: number[];
	authorIds: number[];
}): Promise<void> {
	if (!requiresSearchSync()) return;

	await Promise.all([
		...entities.seriesIds.map((id) => enqueueEntitySync("series", id)),
		...entities.authorIds.map((id) => enqueueEntitySync("author", id)),
	]);
}
