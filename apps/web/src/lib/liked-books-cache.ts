import type { QueryClient } from "@tanstack/react-query";

export type LikedFormat = "books" | "audiobooks";

// orpc keys are [[...path], { type, input }] — a bare path prefix partial-matches
// every cached input variant (sort/format/search).
const LIKED_LIST_KEY = [["likedBooks", "listLiked"]];
const LIKED_COUNT_KEY = [["likedBooks", "count"]];

type LikedListData = {
	pages: { bookUuid: string }[][];
	pageParams: unknown[];
};

/** Drop an unliked book from every cached likes list so removal is instant. */
export function removeBookFromLikedLists(
	queryClient: QueryClient,
	bookUuid: string,
) {
	queryClient.setQueriesData<LikedListData>(
		{ queryKey: LIKED_LIST_KEY },
		(old) =>
			old && {
				...old,
				pages: old.pages.map((page) =>
					page.filter((item) => item.bookUuid !== bookUuid),
				),
			},
	);
}

/** Nudge the cached likes count so subtitles match before the refetch lands. */
export function adjustLikedCount(
	queryClient: QueryClient,
	format: LikedFormat,
	delta: number,
) {
	queryClient.setQueriesData<number>(
		{
			queryKey: LIKED_COUNT_KEY,
			predicate: (query) => {
				const meta = query.queryKey[1] as
					| { input?: { format?: string } }
					| undefined;
				return meta?.input?.format === format;
			},
		},
		(old) => (old == null ? undefined : Math.max(0, old + delta)),
	);
}
