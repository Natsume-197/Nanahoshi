import { RefreshCw } from "lucide-react";
import type { JSX } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { coverPresets } from "@/utils/covers";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import type { RecentlyAddedBook } from "./recently-added-section";

type RandomBooksSectionProps = {
	books: RecentlyAddedBook[];
	isRefreshing: boolean;
	onRefresh: () => void;
};

export function RandomBooksSection({
	books,
	isRefreshing,
	onRefresh,
}: RandomBooksSectionProps): JSX.Element | null {
	if (books.length === 0) {
		return null;
	}

	return (
		<ScrollSection
			title="You might like"
			headerAction={
				<button
					type="button"
					onClick={onRefresh}
					disabled={isRefreshing}
					className="inline-flex items-center gap-1 font-semibold text-muted-foreground text-sm transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
				>
					<RefreshCw
						className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
					/>
					Refresh
				</button>
			}
		>
			{books.map((book) => (
				<DashboardContextMenuBook key={book.uuid} bookUuid={book.uuid}>
					<BookCard
						uuid={book.uuid}
						title={book.title}
						filename={book.filename}
						cover={book.cover}
						authors={book.authors}
						contextMenuEnabled={false}
						coverPreset={coverPresets.small}
					/>
				</DashboardContextMenuBook>
			))}
		</ScrollSection>
	);
}
