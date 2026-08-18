import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";

type PopularFormat = "all" | "books" | "audiobooks";

export const PopularSection = memo(function PopularSection({
	format,
}: {
	format: PopularFormat;
}): JSX.Element | null {
	const { data, isLoading } = useQuery(
		orpc.recommendations.popular.queryOptions({
			input: { format, limit: DASHBOARD_LIMIT },
		}),
	);

	if (isLoading) return <SectionSkeleton square={format === "audiobooks"} />;
	if (!data?.enabled || data.items.length === 0) return null;

	const title =
		format === "books"
			? m["recs.mix_popular_books"]()
			: format === "audiobooks"
				? m["recs.mix_popular_audiobooks"]()
				: m["recs.mix_popular"]();
	const usesSquareCoverFrame = data.items.every(
		(item) => item.book.mediaType === "audiobook",
	);

	return (
		<ScrollSection title={title} restoreId={`popular-${format}`}>
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
							title={item.book.title}
							filename={item.book.filename}
							cover={item.book.cover}
							tint={item.book.mainColor}
							authors={item.book.authors}
							mediaType={item.book.mediaType}
							contextMenuEnabled={false}
							priority={index === 0}
							coverPreset={coverPresets.small}
							compactTextBlock
							coverFrameRatio={usesSquareCoverFrame ? "square" : "book"}
						/>
					</DashboardContextMenuBook>
				);
			})}
		</ScrollSection>
	);
});
