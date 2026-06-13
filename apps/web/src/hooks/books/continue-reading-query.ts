import { DASHBOARD_LIMIT } from "@/components/dashboard/home/section-skeleton";
import { orpc } from "@/utils/orpc";

/**
 * Shared options for the continue-reading list so every consumer (dashboard
 * home loader/section, ambient bloom) hits the same query cache entry.
 */
export function continueReadingQueryOptions() {
	return orpc.readingProgress.listInProgress.queryOptions({
		input: { limit: DASHBOARD_LIMIT },
	});
}
