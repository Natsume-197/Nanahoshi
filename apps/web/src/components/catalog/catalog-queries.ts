import type { QueryCache } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

export type CatalogSort = "recent" | "title" | "author" | "rating";

export function allCatalogOptions(
	{
		format,
		sort,
		query,
		libraryUuid,
	}: {
		format: "ebook" | "audiobook";
		sort: CatalogSort;
		query?: string;
		libraryUuid?: string;
	},
	rpc = orpc,
) {
	return rpc.books.listAll.infiniteOptions({
		input: (cursor: number) => ({
			mediaType: format,
			limit: 30,
			cursor,
			sort: format === "audiobook" && sort === "rating" ? "recent" : sort,
			query: query?.trim() || undefined,
			libraryUuid,
		}),
		getNextPageParam: (lastPage, _pages, cursor) =>
			lastPage.length === 30 ? cursor + 30 : undefined,
		initialPageParam: 0,
	});
}

/** Removed caches and another access scope must never provide placeholders. */
export function retainCatalogData<T>(
	data: T | undefined,
	previousQuery:
		| {
				meta?: Record<string, unknown>;
				queryHash: string;
				state: { isInvalidated: boolean };
		  }
		| undefined,
	scope: string,
	cache: QueryCache,
): T | undefined {
	return previousQuery?.meta?.catalogScope === scope &&
		!previousQuery.state.isInvalidated &&
		cache.get(previousQuery.queryHash) === previousQuery
		? data
		: undefined;
}
