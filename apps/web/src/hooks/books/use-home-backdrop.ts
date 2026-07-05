import { useQuery } from "@tanstack/react-query";
import { DASHBOARD_LIMIT } from "@/components/dashboard/home/section-skeleton";
import { orpc } from "@/utils/orpc";
import { continueReadingQueryOptions } from "./continue-reading-query";

export type HomeBackdrop = {
	uuid: string;
	cover: string | null;
	mainColor: string | null;
};

/**
 * Resolves the single most-recently-touched in-progress title so the home can
 * wash the navbar with its color + cover (the same surface the book detail page
 * paints). Reuses the continue-reading / continue-listening query caches, so it
 * costs no extra request. Both lists arrive most-recent-first from the server.
 */
export function useHomeBackdrop(): HomeBackdrop | null {
	const reading = useQuery(continueReadingQueryOptions());
	const listening = useQuery(
		orpc.listeningProgress.listInProgress.queryOptions({
			input: { limit: DASHBOARD_LIMIT },
		}),
	);

	const topReading = reading.data?.[0];
	const topListening = listening.data?.[0];

	const readingAt = topReading?.lastReadAt ?? "";
	const listeningAt = topListening?.lastListenedAt ?? "";

	// ISO timestamps compare correctly as strings; pick the more recent side.
	const preferListening =
		!!topListening && (!topReading || listeningAt > readingAt);

	if (preferListening && topListening) {
		return {
			uuid: topListening.bookUuid,
			cover: topListening.cover,
			mainColor: topListening.mainColor ?? null,
		};
	}
	if (topReading) {
		return {
			uuid: topReading.bookUuid,
			cover: topReading.cover,
			mainColor: topReading.mainColor ?? null,
		};
	}
	return null;
}
