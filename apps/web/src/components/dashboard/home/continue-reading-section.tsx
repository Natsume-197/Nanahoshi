import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { BookContextMenuTrigger } from "@/components/books/book-context-menu";
import { ScrollSection } from "@/components/shared/scroll-section";
import { continueReadingQueryOptions } from "@/hooks/books/continue-reading-query";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { progressPercent } from "@/utils/format";
import { resumeMeta } from "./resume-meta";
import { ResumeSectionSkeleton } from "./section-skeleton";

export const ContinueReadingSection = memo(function ContinueReadingSection({
	excludeUuid,
}: {
	excludeUuid?: string;
}): JSX.Element | null {
	const { data: entries, isLoading } = useQuery(continueReadingQueryOptions());

	if (isLoading) return <ResumeSectionSkeleton />;
	if (!entries || entries.length === 0) return null;

	const visible = excludeUuid
		? entries.filter((entry) => entry.bookUuid !== excludeUuid)
		: entries;
	if (visible.length === 0) return null;

	return (
		<ScrollSection
			title={m["home.recent"]()}
			showAllHref="/dashboard/recent"
			layout="resume"
			restoreId="continue-reading"
		>
			{visible.map((entry, index) => {
				const progress = progressPercent(
					entry.exploredCharCount,
					entry.bookCharCount,
				);
				return (
					<BookContextMenuTrigger
						key={entry.bookUuid}
						bookUuid={entry.bookUuid}
						className="min-w-0"
					>
						<BookCard
							uuid={entry.bookUuid}
							title={entry.title}
							filename={entry.bookFilename}
							cover={entry.cover}
							authors={entry.authors}
							progress={progress}
							meta={resumeMeta(progress, entry.lastReadAt)}
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
