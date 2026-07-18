import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookContextMenuTrigger } from "@/components/books/book-context-menu";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { progressPercent } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import { MAX_RESUME_TILES, ResumeTile } from "./resume-tile";
import { DASHBOARD_LIMIT, ResumeTileSectionSkeleton } from "./section-skeleton";

export const ContinueListeningSection = memo(function ContinueListeningSection({
	excludeUuid,
}: {
	excludeUuid?: string;
}): JSX.Element | null {
	const { data: entries, isLoading } = useQuery(
		orpc.listeningProgress.listInProgress.queryOptions({
			input: { limit: DASHBOARD_LIMIT },
		}),
	);

	// One of the first four rows: always render a skeleton while loading
	// (square covers, matching the audiobook resume tiles).
	if (isLoading) return <ResumeTileSectionSkeleton square />;
	if (!entries || entries.length === 0) return null;

	const visible = (
		excludeUuid
			? entries.filter((entry) => entry.bookUuid !== excludeUuid)
			: entries
	).slice(0, MAX_RESUME_TILES);
	if (visible.length === 0) return null;

	return (
		<ScrollSection title={m["home.recent"]()} layout="tiles">
			{visible.map((entry, index) => {
				const duration =
					entry.durationSeconds != null && entry.durationSeconds > 0
						? entry.durationSeconds
						: entry.duration;
				const currentTime = entry.currentTimeSeconds ?? 0;
				return (
					<BookContextMenuTrigger
						key={entry.bookUuid}
						bookUuid={entry.bookUuid}
						mediaType="audiobook"
						className="min-w-0"
					>
						<ResumeTile
							uuid={entry.bookUuid}
							title={entry.title}
							filename={entry.bookFilename}
							cover={entry.cover}
							priority={index === 0}
							progress={progressPercent(currentTime, duration)}
							positionSeconds={currentTime}
							totalSeconds={duration}
							lastActivityAt={entry.lastListenedAt}
							mediaType="audiobook"
						/>
					</BookContextMenuTrigger>
				);
			})}
		</ScrollSection>
	);
});
