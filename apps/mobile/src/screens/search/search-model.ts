/** What the results list says when it has no rows to draw. */
export type EmptyListState = "error" | "offline" | "loading" | "empty";

/**
 * A query that is still answering keeps the last results on screen
 * (placeholder data), so "nothing found" is only said by a real answer: a
 * placeholder that is empty belongs to the previous text.
 */
export function emptyListState(query: {
	isError: boolean;
	offline: boolean;
	isPending: boolean;
	isPlaceholderData: boolean;
}): EmptyListState {
	if (query.isError) return "error";
	if (query.offline) return "offline";
	if (query.isPending || query.isPlaceholderData) return "loading";
	return "empty";
}

/**
 * The pages a source adds to the merged "All" list. Old pages stay only
 * while the ranked hits they sit under are old too, so a list never mixes
 * the new text's top hits with the previous text's books.
 */
export function pagesFor<T>(
	source: { data: T | undefined; isPlaceholderData: boolean },
	anchorIsPlaceholder: boolean,
): T | undefined {
	if (source.isPlaceholderData && !anchorIsPlaceholder) return undefined;
	return source.data;
}

/**
 * Placeholder for a search query: the previous text's answer, unless it is
 * from before the field was last emptied (a new search starts on the
 * skeleton, not on what was searched minutes ago).
 */
export function keepResultsSince(clearedAt: number) {
	return <T>(
		previous: T | undefined,
		previousQuery: { state: { dataUpdatedAt: number } } | undefined,
	): T | undefined =>
		previousQuery && previousQuery.state.dataUpdatedAt >= clearedAt
			? previous
			: undefined;
}
