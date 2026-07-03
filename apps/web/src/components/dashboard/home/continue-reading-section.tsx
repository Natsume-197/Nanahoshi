import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { continueReadingQueryOptions } from "@/hooks/books/continue-reading-query";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { progressPercent } from "@/utils/format";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { SectionSkeleton } from "./section-skeleton";

export const ContinueReadingSection = memo(function ContinueReadingSection({
	excludeUuid,
}: {
	excludeUuid?: string;
}): JSX.Element | null {
	const { data: entries, isLoading } = useQuery(continueReadingQueryOptions());

	if (isLoading) return <SectionSkeleton />;
	if (!entries || entries.length === 0) return null;

	const visible = excludeUuid
		? entries.filter((entry) => entry.bookUuid !== excludeUuid)
		: entries;
	if (visible.length === 0) return null;

	return (
		<ScrollSection title={m["home.continue_reading"]()}>
			{visible.map((entry, index) => (
				<DashboardContextMenuBook
					key={entry.bookUuid}
					bookUuid={entry.bookUuid}
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
							entry.exploredCharCount,
							entry.bookCharCount,
						)}
					/>
				</DashboardContextMenuBook>
			))}
		</ScrollSection>
	);
});
