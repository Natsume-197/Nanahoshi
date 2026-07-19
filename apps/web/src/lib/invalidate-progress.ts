import { invalidateEverywhere } from "@/lib/invalidate-everywhere";
import { orpc, queryClient } from "@/utils/orpc";

/**
 * Refetch every progress consumer (continue reading/listening rows,
 * detail-page resume state) after a saveProgress call — unmounted ones too,
 * so the dashboard the user returns to is already fresh instead of flashing
 * the stale cached row first.
 */
export function invalidateListeningProgress() {
	void invalidateEverywhere(queryClient, [orpc.listeningProgress.key()]);
}

export function invalidateReadingProgress() {
	void invalidateEverywhere(queryClient, [orpc.readingProgress.key()]);
}

/**
 * Refetch the recommendation rails after a strong engagement event (reader
 * session end, completion, like) — the server injects a session mix from the
 * freshest seed, so the home the user returns to already reflects what they
 * just read. Not called from periodic syncs: once per event, not per minute.
 */
export function invalidateRecommendations() {
	void invalidateEverywhere(queryClient, [orpc.recommendations.key()]);
}
