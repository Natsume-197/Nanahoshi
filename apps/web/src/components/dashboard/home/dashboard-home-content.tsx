import { type JSX, useState } from "react";
import { BookContextMenuRoot } from "@/components/books/book-context-menu";
import { getRandomBooks } from "@/functions/books/get-recent-books";
import {
	type ContinueReadingEntry,
	ContinueReadingSection,
} from "./continue-reading-section";
import { RandomBooksSection } from "./random-books-section";
import {
	type RecentlyAddedBook,
	RecentlyAddedSection,
} from "./recently-added-section";

type RandomBooks = Awaited<ReturnType<typeof getRandomBooks>>;

type DashboardHomeContentProps = {
	userName: string;
	recentBooks: RecentlyAddedBook[];
	recentlyReadBooks: ContinueReadingEntry[];
	initialRandomBooks: RandomBooks;
};

function getGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 12) return "Good morning";
	if (hour < 18) return "Good afternoon";
	return "Good evening";
}

export function DashboardHomeContent({
	userName,
	recentBooks,
	recentlyReadBooks,
	initialRandomBooks,
}: DashboardHomeContentProps): JSX.Element {
	const [randomBooks, setRandomBooks] =
		useState<RandomBooks>(initialRandomBooks);
	const [isFetchingRandomBooks, setIsFetchingRandomBooks] = useState(false);

	async function handleRefreshRandomBooks(): Promise<void> {
		if (isFetchingRandomBooks) return;
		setIsFetchingRandomBooks(true);
		try {
			const nextBooks = await getRandomBooks();
			setRandomBooks(nextBooks);
		} finally {
			setIsFetchingRandomBooks(false);
		}
	}

	const heroColor =
		recentlyReadBooks[0]?.mainColor ?? recentBooks[0]?.mainColor;

	return (
		<BookContextMenuRoot>
			<div className="relative space-y-8 p-6 lg:p-8">
				{heroColor && (
					<div
						className="pointer-events-none absolute inset-x-0 top-0 h-[340px]"
						style={{
							background: `linear-gradient(to bottom, ${heroColor}25 0%, transparent 100%)`,
						}}
					/>
				)}

				<div className="relative">
					<h1 className="font-bold text-2xl tracking-tight lg:text-3xl">
						{getGreeting()}, {userName}
					</h1>
				</div>

				<ContinueReadingSection entries={recentlyReadBooks} />

				<RecentlyAddedSection
					books={recentBooks}
					prioritizeFirstCover={recentlyReadBooks.length === 0}
				/>

				<RandomBooksSection
					books={randomBooks}
					isRefreshing={isFetchingRandomBooks}
					onRefresh={() => {
						void handleRefreshRandomBooks();
					}}
				/>
			</div>
		</BookContextMenuRoot>
	);
}
