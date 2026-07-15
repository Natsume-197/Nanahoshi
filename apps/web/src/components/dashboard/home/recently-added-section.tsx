import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { EmptyLibraryNotice } from "./empty-library-notice";
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";

export const RecentlyAddedSection = memo(
	function RecentlyAddedSection(): JSX.Element | null {
		const { data: books, isLoading } = useQuery(
			orpc.books.listRecent.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);

		if (isLoading) return <SectionSkeleton />;

		if (!books || books.length === 0) {
			return <EmptyLibraryNotice />;
		}

		return (
			<ScrollSection
				title={m["home.recently_added_books"]()}
				showAllHref="/dashboard/books"
			>
				{books.map((book, index) => (
					<DashboardContextMenuBook key={book.uuid} bookUuid={book.uuid}>
						<BookCard
							uuid={book.uuid}
							title={book.title}
							filename={book.filename}
							cover={book.cover}
							authors={book.authors}
							contextMenuEnabled={false}
							priority={index === 0}
							coverPreset={coverPresets.small}
							compactTextBlock
						/>
					</DashboardContextMenuBook>
				))}
			</ScrollSection>
		);
	},
);
