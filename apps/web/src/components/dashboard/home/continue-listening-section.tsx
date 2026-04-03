import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";

type ContinueListeningEntry = {
	bookUuid: string;
	bookFilename: string;
	title: string | null;
	cover: string | null;
	currentTimeSeconds: number | null;
	durationSeconds: number | null;
	duration: number | null;
	authors?: { id?: number | null; name: string }[];
};

function getProgress(entry: ContinueListeningEntry): number {
	const total = entry.durationSeconds ?? entry.duration ?? 0;
	if (total <= 0) return 0;
	return Math.min(
		Math.round(((entry.currentTimeSeconds ?? 0) / total) * 100),
		100,
	);
}

export const ContinueListeningSection = memo(
	function ContinueListeningSection(): JSX.Element | null {
		const { data: entries, isLoading } = useQuery(
			orpc.listeningProgress.listInProgress.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);

		if (isLoading) return <SectionSkeleton />;
		if (!entries || entries.length === 0) return null;

		return (
			<ScrollSection title="Continue listening">
				{entries.map((entry, index) => (
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
							progress={getProgress(entry)}
							mediaType="audiobook"
						/>
					</DashboardContextMenuBook>
				))}
			</ScrollSection>
		);
	},
);
