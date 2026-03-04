import type { JSX } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/scroll-section";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";

export type RecentlyAddedBook = {
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	mainColor?: string | null;
	authors?: { name: string }[];
};

type RecentlyAddedSectionProps = {
	books: RecentlyAddedBook[];
	prioritizeFirstCover: boolean;
};

export function RecentlyAddedSection({
	books,
	prioritizeFirstCover,
}: RecentlyAddedSectionProps): JSX.Element {
	if (books.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-20 text-center">
				<p className="text-lg text-muted-foreground">
					No books yet. Add a library to get started.
				</p>
			</div>
		);
	}

	return (
		<ScrollSection title="Recently added" showAllHref="/dashboard/search">
			{books.map((book, index) => (
				<DashboardContextMenuBook key={book.uuid} bookUuid={book.uuid}>
					<BookCard
						uuid={book.uuid}
						title={book.title}
						filename={book.filename}
						cover={book.cover}
						authors={book.authors}
						contextMenuEnabled={false}
						priority={prioritizeFirstCover && index === 0}
					/>
				</DashboardContextMenuBook>
			))}
		</ScrollSection>
	);
}
