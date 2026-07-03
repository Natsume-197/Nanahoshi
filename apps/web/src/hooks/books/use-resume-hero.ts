import { useQuery } from "@tanstack/react-query";
import { DASHBOARD_LIMIT } from "@/components/dashboard/home/section-skeleton";
import { progressPercent } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import { continueReadingQueryOptions } from "./continue-reading-query";

export type ResumeHero = {
	kind: "ebook" | "audiobook";
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	mainColor: string | null;
	authors: { id?: number | null; name: string }[];
	progress: number;
};

/**
 * Resolves the single most-recently-touched in-progress title across reading and
 * listening so the dashboard can lead with a "resume" hero. Reuses the exact
 * query options the continue-reading / continue-listening rows use, so it shares
 * their cache entries and never triggers an extra request. Both lists are already
 * ordered most-recent-first by the server, so the head of each is the candidate.
 */
export function useResumeHero(): {
	hero: ResumeHero | null;
	isLoading: boolean;
} {
	const reading = useQuery(continueReadingQueryOptions());
	const listening = useQuery(
		orpc.listeningProgress.listInProgress.queryOptions({
			input: { limit: DASHBOARD_LIMIT },
		}),
	);

	const isLoading = reading.isLoading || listening.isLoading;

	const topReading = reading.data?.[0];
	const topListening = listening.data?.[0];

	const readingAt = topReading?.lastReadAt ?? "";
	const listeningAt = topListening?.lastListenedAt ?? "";

	// ISO timestamps compare correctly as strings; pick the more recent side.
	const preferListening =
		!!topListening && (!topReading || listeningAt > readingAt);

	let hero: ResumeHero | null = null;

	if (preferListening && topListening) {
		hero = {
			kind: "audiobook",
			uuid: topListening.bookUuid,
			title: topListening.title,
			filename: topListening.bookFilename,
			cover: topListening.cover,
			mainColor: topListening.mainColor ?? null,
			authors: topListening.authors ?? [],
			progress: progressPercent(
				topListening.currentTimeSeconds,
				topListening.durationSeconds ?? topListening.duration,
			),
		};
	} else if (topReading) {
		hero = {
			kind: "ebook",
			uuid: topReading.bookUuid,
			title: topReading.title,
			filename: topReading.bookFilename,
			cover: topReading.cover,
			mainColor: topReading.mainColor ?? null,
			authors: topReading.authors ?? [],
			progress: progressPercent(
				topReading.exploredCharCount,
				topReading.bookCharCount,
			),
		};
	}

	return { hero, isLoading };
}
