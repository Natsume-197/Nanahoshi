import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { coverPresets } from "@/utils/covers";
import { progressPercent } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";

export const ContinueReadingSection = memo(
	function ContinueReadingSection(): JSX.Element | null {
		const { data: entries, isLoading } = useQuery(
			orpc.readingProgress.listInProgress.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);

		if (isLoading) return <SectionSkeleton />;
		if (!entries || entries.length === 0) return null;

		return (
			<ScrollSection title="Continue reading">
				{entries.map((entry, index) => (
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
	},
);
