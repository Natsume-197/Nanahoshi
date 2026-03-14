import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2, User } from "lucide-react";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/authors/$authorId")({
	component: AuthorBooksPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
	},
});

const PAGE_SIZE = 30;

function AuthorBooksPage() {
	const { authorId } = Route.useParams();
	const parsedAuthorId = Number.parseInt(authorId, 10);
	const shouldSearch = Number.isFinite(parsedAuthorId);

	const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
		useInfiniteQuery({
			queryKey: ["books", "author", parsedAuthorId],
			queryFn: async ({ pageParam }) => {
				return client.books.search({
					filters: { authorIds: [parsedAuthorId] },
					cursor: pageParam ?? undefined,
					limit: PAGE_SIZE,
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
	const resolvedAuthorName = useMemo(() => {
		if (!shouldSearch) return null;
		for (const book of books) {
			const match = book.authors?.find(
				(author) => author.id === parsedAuthorId,
			);
			if (match?.name) return match.name;
		}
		return null;
	}, [books, parsedAuthorId, shouldSearch]);
	const displayAuthor =
		resolvedAuthorName ?? (shouldSearch ? `Author #${authorId}` : null);

	const { loadMoreRef: lastBookRef } = useInfiniteScroll({
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
		enabled: shouldSearch,
	});

	return (
		<div className="space-y-6 p-6 lg:p-8">
			{displayAuthor && (
				<div className="flex flex-wrap items-baseline gap-2">
					<h1 className="font-semibold text-xl">
						Books by &ldquo;{displayAuthor}&rdquo;
					</h1>
					{totalHits != null && totalHits > 0 && (
						<span className="text-muted-foreground text-sm">
							{totalHits.toLocaleString()} found
						</span>
					)}
				</div>
			)}

			{!displayAuthor && (
				<p className="text-muted-foreground text-sm">Invalid author id.</p>
			)}

			{isLoading && shouldSearch && (
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<Loader2 className="size-4 animate-spin" />
					Loading books...
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
										title={book.title ?? null}
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
					<User className="mb-3 size-10 text-muted-foreground/30" />
					<p className="font-medium">No books for this author yet.</p>
					<p className="mt-1 max-w-sm text-muted-foreground text-sm">
						Try scanning your libraries or check the author spelling.
					</p>
				</div>
			)}
		</div>
	);
}
