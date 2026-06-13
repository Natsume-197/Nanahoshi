import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { continueReadingQueryOptions } from "@/hooks/books/continue-reading-query";
import { coverPresets } from "@/utils/covers";
import { progressPercent } from "@/utils/format";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { SectionSkeleton } from "./section-skeleton";

export const ContinueReadingSection = memo(
	function ContinueReadingSection(): JSX.Element | null {
		const { data: entries, isLoading } = useQuery(
			continueReadingQueryOptions(),
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
							mainColor={entry.mainColor}
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
