import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";

type ContinueSeriesFormat = "all" | "books" | "audiobooks";

export const ContinueSeriesSection = memo(function ContinueSeriesSection({
	format,
}: {
	format: ContinueSeriesFormat;
}): JSX.Element | null {
	const { data, isLoading } = useQuery(
		orpc.recommendations.continueSeries.queryOptions({
			input: { format, limit: DASHBOARD_LIMIT },
		}),
	);

	if (isLoading) return <SectionSkeleton square={format === "audiobooks"} />;
	if (!data || data.items.length === 0) return null;

	return (
		<ScrollSection title={m["home.continue_series"]()}>
			{data.items.map((item, index) => {
				const isAudiobook = item.book.mediaType === "audiobook";
				return (
					<DashboardContextMenuBook
						key={item.book.uuid}
						bookUuid={item.book.uuid}
						mediaType={isAudiobook ? "audiobook" : "ebook"}
						isRecommendation
					>
						<BookCard
							uuid={item.book.uuid}
							title={item.book.title ?? item.seriesName}
							filename={item.book.filename}
							cover={item.book.cover}
							authors={item.book.authors}
							mediaType={item.book.mediaType}
							contextMenuEnabled={false}
							priority={index === 0}
							coverPreset={coverPresets.small}
							compactTextBlock
						/>
					</DashboardContextMenuBook>
				);
			})}
		</ScrollSection>
	);
});
