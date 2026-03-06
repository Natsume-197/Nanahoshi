import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { JSX } from "react";
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

const RANDOM_BOOKS_QUERY_KEY = ["random-books"] as const;

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
	const queryClient = useQueryClient();

	const randomBooksQuery = useQuery({
		queryKey: RANDOM_BOOKS_QUERY_KEY,
		queryFn: () => getRandomBooks(),
		initialData: initialRandomBooks,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const randomBooks = randomBooksQuery.data ?? initialRandomBooks;

	function handleRefreshRandomBooks(): void {
		queryClient.removeQueries({ queryKey: RANDOM_BOOKS_QUERY_KEY });
		void randomBooksQuery.refetch();
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
					isRefreshing={randomBooksQuery.isFetching}
					onRefresh={handleRefreshRandomBooks}
				/>
			</div>
		</BookContextMenuRoot>
	);
}
