import { useQueryClient } from "@tanstack/react-query";
import {
	type JSX,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
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
	recommendationScope: string;
	userName: string;
	recentBooks: RecentlyAddedBook[];
	recentlyReadBooks: ContinueReadingEntry[];
	initialRandomBooks: RandomBooks;
};

export const DashboardHomeContent = memo(function DashboardHomeContent({
	recommendationScope,
	userName,
	recentBooks,
	recentlyReadBooks,
	initialRandomBooks,
}: DashboardHomeContentProps): JSX.Element {
	const queryClient = useQueryClient();
	const randomBooksCacheKey = useMemo(
		() => ["dashboard-home", "random-books", recommendationScope] as const,
		[recommendationScope],
	);
	// Keep the random shelf tied to the loader snapshot so SSR and hydration
	// start from the same data before any client-side refresh happens.
	const [randomBooks, setRandomBooks] = useState<RandomBooks>(
		() => initialRandomBooks,
	);
	const [isRefreshing, setIsRefreshing] = useState(false);

	useEffect(() => {
		const cachedRandomBooks =
			queryClient.getQueryData<RandomBooks>(randomBooksCacheKey);

		if (cachedRandomBooks !== undefined) {
			setRandomBooks(cachedRandomBooks);
			return;
		}

		setRandomBooks(initialRandomBooks);
		queryClient.setQueryData(randomBooksCacheKey, initialRandomBooks);
	}, [initialRandomBooks, queryClient, randomBooksCacheKey]);

	const handleRefreshRandomBooks = useCallback((): void => {
		if (isRefreshing) return;

		setIsRefreshing(true);
		void getRandomBooks()
			.then((nextRandomBooks) => {
				const resolvedRandomBooks = nextRandomBooks ?? [];
				setRandomBooks(resolvedRandomBooks);
				queryClient.setQueryData(randomBooksCacheKey, resolvedRandomBooks);
			})
			.catch((error: unknown) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to refresh recommendations",
				);
			})
			.finally(() => {
				setIsRefreshing(false);
			});
	}, [isRefreshing, queryClient, randomBooksCacheKey]);

	return (
		<BookContextMenuRoot>
			<div className="relative space-y-8 p-6 lg:p-8">
				<ContinueReadingSection entries={recentlyReadBooks} />

				<RecentlyAddedSection
					books={recentBooks}
					prioritizeFirstCover={recentlyReadBooks.length === 0}
				/>

				<RandomBooksSection
					books={randomBooks}
					isRefreshing={isRefreshing}
					onRefresh={handleRefreshRandomBooks}
				/>
			</div>
		</BookContextMenuRoot>
	);
});
