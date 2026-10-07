import type { ReadListenPairing } from "@nanahoshi/api/routers/read-listen/read-listen.service";
import { joinNames } from "@/lib/format";

export type ReadListenSort = "recent" | "title" | "author";
export type AlignmentFilter = "ready" | "not_imported" | "stale" | "any";

/** The web catalog's order over the pages loaded so far; the pair is named
 * after its audiobook, as the web's card is. */
export function sortPairings(
	pairings: readonly ReadListenPairing[],
	sort: ReadListenSort,
) {
	return [...pairings].sort((a, b) => {
		if (sort === "recent") return b.createdAt.localeCompare(a.createdAt);
		if (sort === "author")
			return joinNames(a.audiobook.authors).localeCompare(
				joinNames(b.audiobook.authors),
			);
		return (a.audiobook.title ?? "").localeCompare(b.audiobook.title ?? "");
	});
}
