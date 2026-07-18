import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookContextMenuTrigger } from "@/components/books/book-context-menu";
import { ScrollSection } from "@/components/shared/scroll-section";
import { continueReadingQueryOptions } from "@/hooks/books/continue-reading-query";
import { m } from "@/paraglide/messages";
import { progressPercent } from "@/utils/format";
import { MAX_RESUME_TILES, ResumeTile } from "./resume-tile";
import { ResumeTileSectionSkeleton } from "./section-skeleton";

export const ContinueReadingSection = memo(function ContinueReadingSection({
	excludeUuid,
}: {
	excludeUuid?: string;
}): JSX.Element | null {
	const { data: entries, isLoading } = useQuery(continueReadingQueryOptions());

	if (isLoading) return <ResumeTileSectionSkeleton />;
	if (!entries || entries.length === 0) return null;

	const visible = (
		excludeUuid
			? entries.filter((entry) => entry.bookUuid !== excludeUuid)
			: entries
	).slice(0, MAX_RESUME_TILES);
	if (visible.length === 0) return null;

	return (
		<ScrollSection title={m["home.recent"]()} layout="tiles">
			{visible.map((entry, index) => (
				<BookContextMenuTrigger
					key={entry.bookUuid}
					bookUuid={entry.bookUuid}
					className="min-w-0"
				>
					<ResumeTile
						uuid={entry.bookUuid}
						title={entry.title}
						filename={entry.bookFilename}
						cover={entry.cover}
						priority={index === 0}
						progress={progressPercent(
							entry.exploredCharCount,
							entry.bookCharCount,
						)}
						exploredCharCount={entry.exploredCharCount}
						bookCharCount={entry.bookCharCount}
						lastActivityAt={entry.lastReadAt}
					/>
				</BookContextMenuTrigger>
			))}
		</ScrollSection>
	);
});
