import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import { createBookCardShellRowHeightEstimator } from "@/components/books/book-card-shell";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import {
	CollectionTableHeader,
	CollectionTableRow,
} from "@/components/shared/collection-table-row";
import { CollectionView } from "@/components/shared/collection-view";
import { EmptyState } from "@/components/shared/empty-state";
import type { SortOption } from "@/components/shared/sort-select";
import { useCollectionView } from "@/hooks/use-collection-view";
import { getCoverFilename } from "@/utils/covers";
import { formatRelativeTime } from "@/utils/format";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;
const BOOK_CARD_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

type SortMode = "recent" | "title" | "author";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "recent", label: "Last liked" },
	{ value: "title", label: "Title" },
	{ value: "author", label: "Author" },
];

export const Route = createFileRoute("/dashboard/likes")({
	component: LikesPage,
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

function LikesPage() {
	const {
		view,
		setView,
		sort,
		setSort,
		search,
		setSearch,
		query,
		isSearching,
	} = useCollectionView<SortMode>({
		storageKey: "nh-likes-view",
		defaultSort: "recent",
	});

	const {
		data,
		isLoading,
		isFetching,
		hasNextPage,
		fetchNextPage,
		isFetchingNextPage,
	} = useInfiniteQuery(
		orpc.likedBooks.listLiked.infiniteOptions({
			input: (pageParam: number) => ({
				limit: PAGE_SIZE,
				cursor: pageParam,
				sort,
				query: query || undefined,
			}),
			getNextPageParam: (lastPage, _allPages, lastPageParam) =>
				lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
			initialPageParam: 0,
			staleTime: 30_000,
		}),
	);

	const { data: total } = useQuery({
		...orpc.likedBooks.count.queryOptions(),
		staleTime: 30_000,
	});

	const books = useMemo(() => data?.pages.flat() ?? [], [data]);

	return (
		<BookContextMenuRoot>
			<CollectionView
				title="Likes"
				subtitle={
					total ? `${total} ${total === 1 ? "book" : "books"}` : undefined
				}
				isLoading={isLoading}
				isFetching={isFetching}
				isFetchingNextPage={isFetchingNextPage}
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder="Search likes…"
				searchAriaLabel="Search liked books"
				isSearching={isSearching}
				query={query}
				sort={sort}
				onSortChange={setSort}
				sortOptions={SORT_OPTIONS}
				sortAriaLabel="Sort books"
				view={view}
				onViewChange={setView}
				items={books}
				getKey={(book) => book.bookUuid}
				hasNextPage={hasNextPage}
				fetchNextPage={fetchNextPage}
				gridRowEstimate={BOOK_CARD_ROW_ESTIMATE}
				renderGridItem={(book) => (
					<BookContextMenuTrigger bookUuid={book.bookUuid}>
						<BookCard
							uuid={book.bookUuid}
							title={book.title ?? null}
							filename={book.bookFilename}
							cover={book.cover ?? null}
							mainColor={book.mainColor}
							authors={book.authors}
							contextMenuEnabled={false}
						/>
					</BookContextMenuTrigger>
				)}
				listHeader={<CollectionTableHeader metaLabel="Liked" />}
				renderListItem={(book, index) => (
					<BookContextMenuTrigger bookUuid={book.bookUuid}>
						<CollectionTableRow
							index={index + 1}
							linkProps={{
								to: "/dashboard/books/$uuid",
								params: { uuid: book.bookUuid },
							}}
							coverFilename={getCoverFilename(book.cover)}
							title={book.title ?? book.bookFilename}
							authors={book.authors}
							meta={formatRelativeTime(book.createdAt)}
						/>
					</BookContextMenuTrigger>
				)}
				emptyState={
					<EmptyState
						title="No liked books yet"
						description="Like a book from its card, detail page, or context menu and it will appear here."
					/>
				}
				searchEmptyState={
					<EmptyState
						title="No matches"
						description={`No liked books match “${query}”.`}
					/>
				}
			/>
		</BookContextMenuRoot>
	);
}
