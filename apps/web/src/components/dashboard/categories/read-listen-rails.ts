export type ReadListenRails<T> = {
	continueItems: T[];
	recentItems: T[];
	availableItems: T[];
};

export function partitionReadListenRails<T extends { id: string }>({
	items,
	activityById,
	limit,
	recentLimit,
}: {
	items: readonly T[];
	activityById: ReadonlyMap<string, number>;
	limit: number;
	recentLimit: number;
}): ReadListenRails<T> {
	const continueItems = items
		.filter((item) => activityById.has(item.id))
		.sort(
			(a, b) => (activityById.get(b.id) ?? 0) - (activityById.get(a.id) ?? 0),
		)
		.slice(0, limit);
	const continueIds = new Set(continueItems.map((item) => item.id));
	const remaining = items.filter((item) => !continueIds.has(item.id));
	const recentItems = remaining.slice(0, Math.min(recentLimit, limit));
	const recentIds = new Set(recentItems.map((item) => item.id));
	const availableItems = remaining
		.filter((item) => !recentIds.has(item.id))
		.slice(0, limit);

	return { continueItems, recentItems, availableItems };
}
