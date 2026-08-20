import type { TopHit } from "@nanahoshi-v2/api/routers/search/search.model";
import { orpc } from "@/utils/orpc";

// Ranking depth for the compact header dropdown. The full search page uses the
// same server-ranked route with a larger limit.
export const TOP_RESULTS_LIMIT = 8;

// Compact header dropdown query.
export function topSearchQueryOptions(query: string) {
	return {
		...orpc.search.top.queryOptions({
			input: { query, limit: TOP_RESULTS_LIMIT },
		}),
		staleTime: 60_000,
	};
}

export type { TopHit };
