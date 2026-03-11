import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { BookCard } from "@/components/books/book-card";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";

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
	const observerRef = useRef<IntersectionObserver | null>(null);
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

	useEffect(() => {
		return () => observerRef.current?.disconnect();
	}, []);

	const lastBookRef = useCallback(
		(node: HTMLElement | null) => {
			if (!shouldSearch) return;
			if (isFetchingNextPage) return;
			if (observerRef.current) observerRef.current.disconnect();
			observerRef.current = new IntersectionObserver((entries) => {
				if (entries[0].isIntersecting && hasNextPage) {
					fetchNextPage();
				}
			});
			if (node) observerRef.current.observe(node);
		},
		[isFetchingNextPage, hasNextPage, fetchNextPage, shouldSearch],
	);

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
				<div className="flex flex-col items-center justify-center py-16 text-center">
					<Search className="mb-3 size-10 text-muted-foreground/30" />
					<p className="font-medium">
						No results for &ldquo;{normalizedQuery}&rdquo;
					</p>
					<p className="mt-1 max-w-sm text-muted-foreground text-sm">
						Try a different search term, or check that your libraries have been
						scanned.
					</p>
				</div>
			)}

			{!normalizedQuery && (
				<div className="flex flex-col items-center justify-center py-20 text-center">
					<Search className="mb-3 size-10 text-muted-foreground/30" />
					<p className="text-muted-foreground text-sm">
						Use the search bar above to find books in your library.
					</p>
				</div>
			)}
		</div>
	);
}
