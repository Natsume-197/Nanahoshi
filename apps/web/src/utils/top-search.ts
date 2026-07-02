import type { TopHit } from "@nanahoshi-v2/api/routers/search/search.model";
import { orpc } from "@/utils/orpc";

// Ranking depth for both surfaces: the header dropdown (server-ranked via
// search.top) and the search page (client-side rankTopResults over its own
// section queries), so the same query surfaces the same top hits.
export const TOP_RESULTS_LIMIT = 8;

// Header dropdown only — the search page ranks client-side instead of
// re-running every search on the server through search.top.
export function topSearchQueryOptions(query: string) {
	return {
		...orpc.search.top.queryOptions({
			input: { query, limit: TOP_RESULTS_LIMIT },
		}),
		staleTime: 60_000,
	};
}

export type { TopHit };
