import type { QueryClient, QueryFilters } from "@tanstack/react-query";

/**
 * Writes `update` into every cached answer the filters match and returns the
 * undo. In-flight fetches are cancelled first: an answer from before the
 * change would land on top of it.
 */
export async function patchQueries<T>(
	client: QueryClient,
	filters: QueryFilters,
	update: (data: T) => T,
): Promise<() => void> {
	await client.cancelQueries(filters);
	const previous = client.getQueriesData<T>(filters);
	for (const [key, data] of previous)
		if (data !== undefined) client.setQueryData(key, update(data));
	return () => {
		for (const [key, data] of previous) client.setQueryData(key, data);
	};
}

/** A shelf `get` answer with another status, or null once taken off. */
export function withShelfStatus<T extends { status: string }>(
	entry: T | null | undefined,
	status: T["status"] | null,
): T | null {
	if (status === null) return null;
	return { ...(entry ?? ({} as T)), status };
}

type Membership = {
	id: string;
	inCollection: boolean;
	bookCount: number | null;
};

/** listBookMemberships after a check flips: the mark and the count. */
export function withMembership<T extends Membership>(
	list: T[],
	collectionId: string,
	inCollection: boolean,
): T[] {
	return list.map((collection) => {
		if (collection.id !== collectionId) return collection;
		if (collection.inCollection === inCollection) return collection;
		const count =
			collection.bookCount == null
				? collection.bookCount
				: Math.max(0, collection.bookCount + (inCollection ? 1 : -1));
		return { ...collection, inCollection, bookCount: count };
	});
}

/** A continue rail without the title just taken off it. */
export function withoutBook<T extends { bookUuid: string }>(
	list: T[],
	bookUuid: string,
): T[] {
	return list.filter((entry) => entry.bookUuid !== bookUuid);
}

type RecItem = { book?: { uuid: string } | null };

/** A recommendation answer (mixes, or a flat list) without one title. */
export function withoutRecommendation<
	T extends { mixes?: { items: RecItem[] }[]; items?: RecItem[] },
>(data: T, bookUuid: string): T {
	const keep = (item: RecItem) => item.book?.uuid !== bookUuid;
	return {
		...data,
		...(data.mixes
			? {
					mixes: data.mixes.map((mix) => ({
						...mix,
						items: mix.items.filter(keep),
					})),
				}
			: {}),
		...(data.items ? { items: data.items.filter(keep) } : {}),
	};
}
