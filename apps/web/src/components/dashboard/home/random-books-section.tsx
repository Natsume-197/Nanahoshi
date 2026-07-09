import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type JSX, memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { client, orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { DASHBOARD_LIMIT } from "./section-skeleton";

export const RandomBooksSection = memo(
	function RandomBooksSection(): JSX.Element | null {
		const queryClient = useQueryClient();
		const randomBooks = orpc.books.listRandom.queryOptions({
			input: { limit: DASHBOARD_LIMIT },
		});
		const { data: books, isLoading } = useQuery({
			...randomBooks,
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

		if (isLoading) return null;
		if (!books || books.length === 0) return null;

		return (
			<ScrollSection
				title={m["home.you_might_like"]()}
				headerAction={
					<button
						type="button"
						onClick={handleRefresh}
						disabled={isRefreshing}
						className="inline-flex items-center gap-1 font-semibold text-muted-foreground text-sm transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
					>
						{m["home.refresh"]()}
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
	},
);
