import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2, Search } from "lucide-react";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/search")({
	component: SearchPage,
	validateSearch: (search: Record<string, unknown>) => ({
		q: (search.q as string) || "",
	}),
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

const SEARCH_MIN_QUERY_LENGTH = 1;

function SearchPage() {
	const { q } = Route.useSearch();
	const normalizedQuery = q.trim();
	const shouldSearch = normalizedQuery.length >= SEARCH_MIN_QUERY_LENGTH;

	const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
		useInfiniteQuery({
			queryKey: ["books", "search", normalizedQuery],
			queryFn: async ({ pageParam }) => {
				return client.books.search({
					query: normalizedQuery || undefined,
					cursor: pageParam ?? undefined,
					limit: 30,
				});
			},
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (lastPage) => lastPage.pagination.cursor,
			enabled: shouldSearch,
			staleTime: 60_000,
		});

	const books = useMemo(
		() => data?.pages.flatMap((page) => page.books) ?? [],
		[data],
	);
	const totalHits = data?.pages[0]?.pagination.totalHits;

	const { loadMoreRef: lastBookRef } = useInfiniteScroll({
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
		enabled: shouldSearch,
	});

	return (
		<div className="space-y-6 p-6 lg:p-8">
			{normalizedQuery && (
				<div className="flex items-baseline gap-2">
					<h1 className="font-semibold text-xl">
						Results for &ldquo;{normalizedQuery}&rdquo;
					</h1>
					{totalHits != null && totalHits > 0 && (
						<span className="text-muted-foreground text-sm">
							{totalHits.toLocaleString()} found
						</span>
					)}
				</div>
			)}

			{normalizedQuery && !shouldSearch && (
				<p className="text-muted-foreground text-sm">
					Type at least {SEARCH_MIN_QUERY_LENGTH} character
					{SEARCH_MIN_QUERY_LENGTH === 1 ? "" : "s"} to search.
				</p>
			)}

			{isLoading && shouldSearch && (
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<Loader2 className="size-4 animate-spin" />
					Searching...
				</div>
			)}

			{books.length > 0 && (
				<BookContextMenuRoot>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{books.map((book, index: number) => (
							<div
								key={book.uuid}
								ref={index === books.length - 1 ? lastBookRef : undefined}
							>
								<BookContextMenuTrigger bookUuid={book.uuid}>
									<BookCard
										uuid={book.uuid}
										title={
											book.highlight?.title ? undefined : (book.title ?? null)
										}
										titleHtml={book.highlight?.title}
										filename={book.filename}
										cover={book.cover ?? null}
										authors={book.authors ?? undefined}
										contextMenuEnabled={false}
									/>
								</BookContextMenuTrigger>
							</div>
						))}
					</div>
				</BookContextMenuRoot>
			)}

			{isFetchingNextPage && (
				<div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
					<Loader2 className="size-4 animate-spin" />
					Loading more...
				</div>
			)}

			{books.length === 0 && shouldSearch && !isLoading && (
				<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-border/70 border-dashed bg-card/30 px-6 text-center">
					<div className="flex size-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
						<Search className="size-5" />
					</div>
					<div className="flex flex-col gap-1">
						<h3 className="font-semibold text-lg">
							No results for &ldquo;{normalizedQuery}&rdquo;
						</h3>
						<p className="max-w-sm text-muted-foreground text-sm">
							Try a different search term, or check that your libraries have
							been scanned.
						</p>
					</div>
				</div>
			)}

			{!normalizedQuery && (
				<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-border/70 border-dashed bg-card/30 px-6 text-center">
					<div className="flex size-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
						<Search className="size-5" />
					</div>
					<div className="flex flex-col gap-1">
						<p className="max-w-sm text-muted-foreground text-sm">
							Use the search bar above to find books in your library.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
