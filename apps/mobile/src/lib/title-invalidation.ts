import type { Query, QueryClient } from "@tanstack/react-query";

// Namespaces that never hold a title's metadata.
const UNRELATED = new Set([
	"notifications",
	"profile",
	"users",
	"members",
	"organizations",
	"settings",
	"userSettings",
	"tasks",
	"readingSessions",
	"stats",
]);

/** Whether a query can show a title's metadata: a server answer (oRPC keys
 * start with the procedure path) outside the namespaces that never do. The
 * hand-keyed ones hold the reader page, book files or tab icons. */
export function mayShowTitles(query: Pick<Query, "queryKey">): boolean {
	const path = query.queryKey[0];
	if (!Array.isArray(path)) return false;
	return !UNRELATED.has(String(path[0]));
}

/**
 * After a title's metadata changes (edit, match, enrich, restore, delete):
 * it can be on its page, in rails, lists and search, so those refetch; the
 * rest of the cache is left alone, where a bare invalidateQueries() reloaded
 * every mounted query in every tab, the reader page and the tab icons too.
 */
export function refreshTitles(queryClient: QueryClient) {
	return queryClient.invalidateQueries({ predicate: mayShowTitles });
}
