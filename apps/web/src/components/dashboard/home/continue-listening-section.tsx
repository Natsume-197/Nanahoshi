import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { BookContextMenuTrigger } from "@/components/books/book-context-menu";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { progressPercent } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import { resumeMeta } from "./resume-meta";
import { DASHBOARD_LIMIT, ResumeSectionSkeleton } from "./section-skeleton";

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

	// One of the first four rows: always render a skeleton while loading.
	if (isLoading) return <ResumeSectionSkeleton />;
	if (!entries || entries.length === 0) return null;

	const visible = excludeUuid
		? entries.filter((entry) => entry.bookUuid !== excludeUuid)
		: entries;
	if (visible.length === 0) return null;

	return (
		<ScrollSection
			title={m["home.continue_listening"]()}
			showAllHref="/dashboard/recent"
			layout="resume"
			restoreId="continue-listening"
		>
			{visible.map((entry, index) => {
				const duration =
					entry.durationSeconds != null && entry.durationSeconds > 0
						? entry.durationSeconds
						: entry.duration;
				const progress = progressPercent(
					entry.currentTimeSeconds ?? 0,
					duration,
				);
				return (
					<BookContextMenuTrigger
						key={entry.bookUuid}
						bookUuid={entry.bookUuid}
						mediaType="audiobook"
						className="min-w-0"
					>
						<BookCard
							uuid={entry.bookUuid}
							title={entry.title}
							filename={entry.bookFilename}
							cover={entry.cover}
							authors={entry.authors}
							mediaType="audiobook"
							progress={progress}
							meta={resumeMeta(progress, entry.lastListenedAt)}
							orientation="horizontal"
							contextMenuEnabled={false}
							priority={index === 0}
							coverPreset={coverPresets.small}
							compactTextBlock
						/>
					</BookContextMenuTrigger>
				);
			})}
		</ScrollSection>
	);
});
