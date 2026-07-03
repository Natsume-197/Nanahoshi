import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { progressPercent } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";

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
	// (square covers, matching the audiobook tiles).
	if (isLoading) return <SectionSkeleton square />;
	if (!entries || entries.length === 0) return null;

	const visible = excludeUuid
		? entries.filter((entry) => entry.bookUuid !== excludeUuid)
		: entries;
	if (visible.length === 0) return null;

	return (
		<ScrollSection title={m["home.continue_listening"]()}>
			{visible.map((entry, index) => (
				<DashboardContextMenuBook
					key={entry.bookUuid}
					bookUuid={entry.bookUuid}
					mediaType="audiobook"
				>
					<BookCard
						uuid={entry.bookUuid}
						title={entry.title}
						filename={entry.bookFilename}
						cover={entry.cover}
						authors={entry.authors}
						contextMenuEnabled={false}
						priority={index === 0}
						coverPreset={coverPresets.small}
						progress={progressPercent(
							entry.currentTimeSeconds,
							entry.durationSeconds ?? entry.duration,
						)}
						mediaType="audiobook"
					/>
				</DashboardContextMenuBook>
			))}
		</ScrollSection>
	);
});
