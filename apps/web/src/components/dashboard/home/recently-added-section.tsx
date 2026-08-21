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
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";

export const RecentlyAddedSection = memo(
	function RecentlyAddedSection(): JSX.Element | null {
		const booksQuery = useQuery(
			orpc.books.listRecent.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);
		const audiobooksQuery = useQuery(
			orpc.audiobooks.listRecent.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);

		const entries = [
			...(booksQuery.data ?? []).map((book) => ({
				key: `ebook-${book.uuid}`,
				mediaType: "ebook" as const,
				createdAt: book.createdAt,
				book,
			})),
			...(audiobooksQuery.data ?? []).map((book) => ({
				key: `audiobook-${book.uuid}`,
				mediaType: "audiobook" as const,
				createdAt: book.createdAt,
				book,
			})),
		]
			.sort(
				(a, b) =>
					new Date(b.createdAt ?? 0).getTime() -
					new Date(a.createdAt ?? 0).getTime(),
			)
			.slice(0, DASHBOARD_LIMIT);
		const isLoading = booksQuery.isLoading || audiobooksQuery.isLoading;
		useReportHomeSectionStatus(
			isLoading ? "loading" : entries.length > 0 ? "populated" : "empty",
		);
		const showLoadingPlaceholder = useHomeSectionLoadingPlaceholder();

		if (isLoading) return showLoadingPlaceholder ? <SectionSkeleton /> : null;

		if (entries.length === 0) return null;
		const usesSquareCoverFrame = entries.every(
			(entry) => entry.mediaType === "audiobook",
		);

		return (
			<ScrollSection
				title={m["home.recently_added"]()}
				restoreId="recently-added"
			>
				{entries.map(({ key, mediaType, book }, index) => (
					<DashboardContextMenuBook
						key={key}
						bookUuid={book.uuid}
						mediaType={mediaType}
					>
						<BookCard
							uuid={book.uuid}
							title={book.title}
							filename={book.filename}
							cover={book.cover}
							tint={book.mainColor}
							authors={book.authors}
							contextMenuEnabled={false}
							priority={index === 0}
							coverPreset={coverPresets.small}
							compactTextBlock
							mediaType={mediaType}
							coverFrameRatio={usesSquareCoverFrame ? "square" : "book"}
						/>
					</DashboardContextMenuBook>
				))}
			</ScrollSection>
		);
	},
);
