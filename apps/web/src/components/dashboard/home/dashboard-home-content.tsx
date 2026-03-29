import { type JSX, memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { BookContextMenuRoot } from "@/components/books/book-context-menu";
import { ScrollSection } from "@/components/shared/scroll-section";
import { Skeleton } from "@/components/ui/skeleton";
import { client } from "@/utils/orpc";
import {
	type AudiobookSeriesEntry,
	AudiobookSeriesSection,
} from "./audiobook-series-section";
import { type BookSeriesEntry, BookSeriesSection } from "./book-series-section";
import {
	type ContinueListeningEntry,
	ContinueListeningSection,
} from "./continue-listening-section";
import {
	type ContinueReadingEntry,
	ContinueReadingSection,
} from "./continue-reading-section";
import { RandomBooksSection } from "./random-books-section";
import {
	type RecentlyAddedAudiobook,
	RecentlyAddedAudiobooksSection,
} from "./recently-added-audiobooks-section";
import {
	type RecentlyAddedBook,
	RecentlyAddedSection,
} from "./recently-added-section";

type DashboardHomeContentProps = {
	isLoading: boolean;
	recentBooks: RecentlyAddedBook[];
	recentlyReadBooks: ContinueReadingEntry[];
	continueListeningBooks: ContinueListeningEntry[];
	recentAudiobooks: RecentlyAddedAudiobook[];
	bookSeries: BookSeriesEntry[];
	audiobookSeries: AudiobookSeriesEntry[];
	initialRandomBooks: RecentlyAddedBook[];
};

const SKELETON_IDS = Array.from({ length: 15 }, (_, i) => `skeleton-${i}`);
const SKELETON_CARDS = SKELETON_IDS.map((id) => (
	<BookCardSkeleton key={id} className="w-[160px] shrink-0" />
));

function DashboardHomeSkeleton(): JSX.Element {
	return (
		<div className="space-y-4 px-3 py-6 md:px-6 md:py-6 lg:px-8 lg:py-8">
			<ScrollSection title={<Skeleton className="h-5 w-44 rounded" />}>
				{SKELETON_CARDS}
			</ScrollSection>
			<ScrollSection title={<Skeleton className="h-5 w-36 rounded" />}>
				{SKELETON_CARDS}
			</ScrollSection>
			<ScrollSection title={<Skeleton className="h-5 w-32 rounded" />}>
				{SKELETON_CARDS}
			</ScrollSection>
		</div>
	);
}

export const DashboardHomeContent = memo(function DashboardHomeContent({
	isLoading,
	recentBooks,
	recentlyReadBooks,
	continueListeningBooks,
	recentAudiobooks,
	bookSeries,
	audiobookSeries,
	initialRandomBooks,
}: DashboardHomeContentProps): JSX.Element {
	const [refreshedBooks, setRefreshedBooks] = useState<
		RecentlyAddedBook[] | null
	>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const randomBooks = refreshedBooks ?? initialRandomBooks;

	const handleRefreshRandomBooks = useCallback((): void => {
		if (isRefreshing) return;

		setIsRefreshing(true);
		client.books
			.listRandom({ limit: 15 })
			.then((nextRandomBooks) => {
				setRefreshedBooks((nextRandomBooks ?? []) as RecentlyAddedBook[]);
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
	}, [isRefreshing]);

	if (isLoading) {
		return <DashboardHomeSkeleton />;
	}

	return (
		<BookContextMenuRoot>
			<div className="relative space-y-4 px-3 py-6 md:px-6 md:py-6 lg:px-8 lg:py-8">
				<ContinueReadingSection entries={recentlyReadBooks} />
				<ContinueListeningSection entries={continueListeningBooks} />

				<RecentlyAddedSection
					books={recentBooks}
					prioritizeFirstCover={recentlyReadBooks.length === 0}
				/>

				<BookSeriesSection series={bookSeries} />

				<RecentlyAddedAudiobooksSection audiobooks={recentAudiobooks} />

				<AudiobookSeriesSection series={audiobookSeries} />

				<RandomBooksSection
					books={randomBooks}
					isRefreshing={isRefreshing}
					onRefresh={handleRefreshRandomBooks}
				/>
			</div>
		</BookContextMenuRoot>
	);
});
