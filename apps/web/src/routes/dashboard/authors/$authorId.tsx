import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { VirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
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

	// Ebooks query
	const {
		data: booksData,
		isLoading: isBooksLoading,
		hasNextPage: booksHasNextPage,
		fetchNextPage: booksFetchNextPage,
		isFetchingNextPage: booksIsFetchingNextPage,
	} = useInfiniteQuery({
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

	// Audiobooks query
	const {
		data: audiobooksData,
		isLoading: isAudiobooksLoading,
		hasNextPage: audiobooksHasNextPage,
		fetchNextPage: audiobooksFetchNextPage,
		isFetchingNextPage: audiobooksIsFetchingNextPage,
	} = useInfiniteQuery({
		queryKey: ["audiobooks", "author", parsedAuthorId],
		queryFn: async ({ pageParam }) => {
			return client.audiobooks.search({
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
		() => booksData?.pages.flatMap((page) => page.books) ?? [],
		[booksData],
	);
	const audiobooks = useMemo(
		() => audiobooksData?.pages.flatMap((page) => page.audiobooks) ?? [],
		[audiobooksData],
	);

	const booksTotalHits = booksData?.pages[0]?.pagination.totalHits ?? 0;
	const audiobooksTotalHits =
		audiobooksData?.pages[0]?.pagination.totalHits ?? 0;
	const totalHits = booksTotalHits + audiobooksTotalHits;

	const resolvedAuthorName = useMemo(() => {
		if (!shouldSearch) return null;
		for (const book of books) {
			const match = book.authors?.find(
				(author) => author.id === parsedAuthorId,
			);
			if (match?.name) return match.name;
		}
		for (const audiobook of audiobooks) {
			const match = audiobook.authors?.find(
				(author) => author.id === parsedAuthorId,
			);
			if (match?.name) return match.name;
		}
		return null;
	}, [books, audiobooks, parsedAuthorId, shouldSearch]);
	const displayAuthor =
		resolvedAuthorName ?? (shouldSearch ? `Author #${authorId}` : null);

	const isLoading = isBooksLoading || isAudiobooksLoading;
	const hasNoResults =
		shouldSearch && !isLoading && books.length === 0 && audiobooks.length === 0;

	return (
		<div className="space-y-6 p-6 lg:p-8">
			{displayAuthor && (
				<div className="flex flex-wrap items-baseline gap-2">
					<h1 className="font-semibold text-xl">
						Works by &ldquo;{displayAuthor}&rdquo;
					</h1>
					{totalHits > 0 && (
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
					Loading...
				</div>
			)}

			{/* Ebooks */}
			{books.length > 0 && (
				<section className="space-y-3">
					{audiobooks.length > 0 && (
						<div className="flex items-baseline gap-2">
							<h2 className="font-semibold text-lg">Books</h2>
							{booksTotalHits > 0 && (
								<span className="text-muted-foreground text-sm">
									{booksTotalHits.toLocaleString()} found
								</span>
							)}
						</div>
					)}
					<BookContextMenuRoot>
						<VirtualizedCardGrid
							items={books}
							getKey={(book) => book.uuid}
							gap={8}
							estimateRowHeight={330}
							hasNextPage={booksHasNextPage}
							isFetchingNextPage={booksIsFetchingNextPage}
							fetchNextPage={booksFetchNextPage}
							renderItem={(book) => (
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
							)}
						/>
					</BookContextMenuRoot>
				</section>
			)}

			{/* Audiobooks */}
			{audiobooks.length > 0 && (
				<section className="space-y-3">
					<div className="flex items-baseline gap-2">
						<h2 className="font-semibold text-lg">Audiobooks</h2>
						{audiobooksTotalHits > 0 && (
							<span className="text-muted-foreground text-sm">
								{audiobooksTotalHits.toLocaleString()} found
							</span>
						)}
					</div>
					<BookContextMenuRoot mediaType="audiobook">
						<VirtualizedCardGrid
							items={audiobooks}
							getKey={(audiobook) => audiobook.uuid}
							gap={8}
							estimateRowHeight={330}
							hasNextPage={audiobooksHasNextPage}
							isFetchingNextPage={audiobooksIsFetchingNextPage}
							fetchNextPage={audiobooksFetchNextPage}
							renderItem={(audiobook) => (
								<BookContextMenuTrigger bookUuid={audiobook.uuid}>
									<BookCard
										uuid={audiobook.uuid}
										title={audiobook.title ?? null}
										filename={audiobook.filename}
										cover={audiobook.cover ?? null}
										mainColor={audiobook.mainColor}
										authors={audiobook.authors ?? undefined}
										mediaType="audiobook"
										contextMenuEnabled={false}
									/>
								</BookContextMenuTrigger>
							)}
						/>
					</BookContextMenuRoot>
				</section>
			)}

			{hasNoResults && (
				<EmptyState
					title="No works yet"
					description="Try scanning your libraries or check the author spelling."
				/>
			)}
		</div>
	);
}
