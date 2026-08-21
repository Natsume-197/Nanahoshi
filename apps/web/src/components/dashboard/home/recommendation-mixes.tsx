import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import {
	useHomeSectionLoadingPlaceholder,
	useReportHomeSectionStatus,
} from "./home-section-status";
import { mergeRecommendationMixes } from "./recommendation-mixes-utils";
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";

type RecommendationFormat = "books" | "audiobooks";

export const RecommendationsSection = memo(function RecommendationsSection({
	format,
}: {
	format: RecommendationFormat;
}): JSX.Element | null {
	const recommendationsQuery = orpc.recommendations.forUser.queryOptions({
		input: { format, perMixLimit: DASHBOARD_LIMIT },
	});
	const { data, isLoading } = useQuery({
		...recommendationsQuery,
		// Re-evaluate rotation on a new dashboard visit. The in-memory result stays
		// stable while the section remains mounted; focus/reconnect never reshuffle it.
		staleTime: 0,
		refetchOnMount: "always",
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
	const items = mergeRecommendationMixes(data?.mixes ?? [], DASHBOARD_LIMIT);
	const title =
		format === "books"
			? m["recs.books_for_you"]()
			: m["recs.audiobooks_for_you"]();
	const hasContent =
		!isLoading &&
		Boolean(data?.enabled) &&
		(data?.mixes.length ?? 0) > 0 &&
		items.length > 0 &&
		!items.every((item) => item.reason.type === "popular");
	useReportHomeSectionStatus(
		isLoading ? "loading" : hasContent ? "populated" : "empty",
	);
	const showLoadingPlaceholder = useHomeSectionLoadingPlaceholder();

	if (isLoading) {
		return showLoadingPlaceholder ? (
			<SectionSkeleton square={format === "audiobooks"} />
		) : null;
	}
	if (!data?.enabled || data.mixes.length === 0) return null;
	if (items.length === 0) return null;
	// A new user may receive the server ranking as the API's cold-start fallback.
	// The dedicated popularity row renders that data, so avoid showing it twice.
	if (items.every((item) => item.reason.type === "popular")) return null;

	return (
		<ScrollSection title={title} restoreId={`recs-${format}`}>
			{items.map((item, index) => (
				<DashboardContextMenuBook
					key={item.book.uuid}
					bookUuid={item.book.uuid}
					mediaType={format === "audiobooks" ? "audiobook" : "ebook"}
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
						coverFrameRatio={format === "audiobooks" ? "square" : "book"}
					/>
				</DashboardContextMenuBook>
			))}
		</ScrollSection>
	);
});
