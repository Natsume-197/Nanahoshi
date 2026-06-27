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
import { resolveYear } from "@/utils/format";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;

type SortMode = "recent" | "title" | "author";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "recent", label: "Recently added" },
	{ value: "title", label: "Title" },
	{ value: "author", label: "Author" },
];

export const Route = createFileRoute("/dashboard/libraries/$libraryId")({
	component: LibraryDetailPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function LibraryDetailPage() {
	const { libraryId } = Route.useParams();
	const id = Number(libraryId);

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
		storageKey: "nh-library-view",
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
		orpc.books.listByLibrary.infiniteOptions({
			input: (pageParam: number) => ({
				libraryId: id,
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

	const { data: library } = useQuery({
		...orpc.libraries.getLibraryById.queryOptions({ input: { id } }),
		staleTime: 30_000,
	});

	const { data: total } = useQuery({
		...orpc.books.countByLibrary.queryOptions({ input: { libraryId: id } }),
		staleTime: 30_000,
	});

	const books = useMemo(() => data?.pages.flat() ?? [], [data]);
	const isAudiobook = library?.mediaType === "audiobook";
	const mediaType = isAudiobook ? "audiobook" : "ebook";
	const gridRowEstimate = useMemo(
		() => createBookCardShellRowHeightEstimator({ square: isAudiobook }),
		[isAudiobook],
	);

	return (
		<BookContextMenuRoot>
			<CollectionView
				title={library?.name ?? "Library"}
				subtitle={
					total ? `${total} ${total === 1 ? "book" : "books"}` : undefined
				}
				isLoading={isLoading}
				isFetching={isFetching}
				isFetchingNextPage={isFetchingNextPage}
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder="Search this library…"
				searchAriaLabel="Search books in this library"
				isSearching={isSearching}
				query={query}
				sort={sort}
				onSortChange={setSort}
				sortOptions={SORT_OPTIONS}
				sortAriaLabel="Sort books"
				view={view}
				onViewChange={setView}
				items={books}
				getKey={(book) => book.uuid}
				hasNextPage={hasNextPage}
				fetchNextPage={fetchNextPage}
				gridRowEstimate={gridRowEstimate}
				renderGridItem={(book) => (
					<BookContextMenuTrigger bookUuid={book.uuid}>
						<BookCard
							uuid={book.uuid}
							title={book.title}
							filename={book.filename}
							cover={book.cover}
							mainColor={book.mainColor}
							authors={book.authors}
							mediaType={mediaType}
							contextMenuEnabled={false}
						/>
					</BookContextMenuTrigger>
				)}
				listHeader={<CollectionTableHeader metaLabel="Year" />}
				renderListItem={(book, index) => (
					<BookContextMenuTrigger bookUuid={book.uuid}>
						<CollectionTableRow
							index={index + 1}
							linkProps={{
								to: "/dashboard/books/$uuid",
								params: { uuid: book.uuid },
							}}
							coverFilename={getCoverFilename(book.cover)}
							title={book.title ?? book.filename}
							authors={book.authors}
							meta={resolveYear(book.publishedDate)}
						/>
					</BookContextMenuTrigger>
				)}
				emptyState={
					<EmptyState
						title="No books yet"
						description="This library doesn't have any books yet."
					/>
				}
				searchEmptyState={
					<EmptyState
						title="No matches"
						description={`No books in this library match “${query}”.`}
					/>
				}
			/>
		</BookContextMenuRoot>
	);
}
