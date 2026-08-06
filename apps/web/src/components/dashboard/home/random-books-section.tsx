import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type JSX, memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { client, orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { RandomRefreshButton } from "./random-refresh-button";
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";

export const RandomBooksSection = memo(
	function RandomBooksSection(): JSX.Element | null {
		const queryClient = useQueryClient();
		const randomBooks = orpc.books.listRandom.queryOptions({
			input: { limit: DASHBOARD_LIMIT },
		});
		const { data: books, isLoading } = useQuery({
			...randomBooks,
			// Pin the shuffle for the session so the rail never re-randomizes on
			// refocus/reconnect/remount — only the refresh button reshuffles.
			staleTime: Number.POSITIVE_INFINITY,
			gcTime: Number.POSITIVE_INFINITY,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});
		const [isRefreshing, setIsRefreshing] = useState(false);

		const handleRefresh = useCallback((): void => {
			if (isRefreshing) return;

			setIsRefreshing(true);
			client.books
				.listRandom({ limit: DASHBOARD_LIMIT })
				.then((nextBooks) => {
					// Write into the query cache (not local state) so the refreshed
					// shuffle survives the section unmounting/remounting on navigation.
					queryClient.setQueryData(randomBooks.queryKey, nextBooks);
				})
				.catch((error: unknown) => {
					toast.error(
						error instanceof Error
							? error.message
							: m["toast.refresh_recommendations_failed"](),
					);
				})
				.finally(() => {
					setIsRefreshing(false);
				});
		}, [isRefreshing, queryClient, randomBooks.queryKey]);

		if (isLoading) return <SectionSkeleton />;
		if (!books || books.length === 0) return null;

		const title = m["home.random_books"]();

		return (
			<ScrollSection
				title={title}
				restoreId="random-books"
				headerAction={
					<RandomRefreshButton
						disabled={isRefreshing}
						onRefresh={handleRefresh}
						sectionTitle={title}
					/>
				}
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
