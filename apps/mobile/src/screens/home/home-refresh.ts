import type { Query } from "@tanstack/react-query";

// Every procedure a Home section reads (the category pages read the same).
const HOME_PROCEDURES = new Set([
	"libraries.getLibraries",
	"books.listRecent",
	"audiobooks.listRecent",
	"readingProgress.listInProgress",
	"listeningProgress.listInProgress",
	"recommendations.forUser",
	"recommendations.popular",
	"collections.discover",
	"collections.list",
	"series.list",
	"audiobooks.listSeries",
	"books.listRandom",
	"audiobooks.listRandom",
]);

/** Whether a cached answer is one Home draws (oRPC keys start with the
 * procedure path; hand-keyed queries never are). */
export function isHomeQuery(query: Pick<Query, "queryKey">): boolean {
	const path = query.queryKey[0];
	return Array.isArray(path) && HOME_PROCEDURES.has(path.join("."));
}
