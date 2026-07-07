import { orpc, queryClient } from "@/utils/orpc";

/**
 * Mark every progress consumer stale (continue reading/listening rows,
 * detail-page resume state) after a saveProgress call, so mounted views
 * refetch immediately and unmounted ones refetch on return.
 */
export function invalidateListeningProgress() {
	queryClient.invalidateQueries({ queryKey: orpc.listeningProgress.key() });
}

export function invalidateReadingProgress() {
	queryClient.invalidateQueries({ queryKey: orpc.readingProgress.key() });
}
