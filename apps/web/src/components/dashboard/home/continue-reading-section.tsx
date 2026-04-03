import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";

type ContinueReadingEntry = {
	bookUuid: string;
	bookFilename: string;
	title: string | null;
	cover: string | null;
	mainColor?: string | null;
	exploredCharCount: number | null;
	bookCharCount: number | null;
	authors?: { id?: number | null; name: string }[];
};

function getProgress(entry: ContinueReadingEntry): number {
	if (!entry.bookCharCount || entry.bookCharCount <= 0) return 0;
	return Math.min(
		Math.round(((entry.exploredCharCount ?? 0) / entry.bookCharCount) * 100),
		100,
	);
}

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
							progress={getProgress(entry)}
						/>
					</DashboardContextMenuBook>
				))}
			</ScrollSection>
		);
	},
);
