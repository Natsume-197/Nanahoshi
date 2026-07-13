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
