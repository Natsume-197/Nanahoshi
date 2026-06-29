import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";
import { getCoverFilename } from "@/utils/covers";
import { resolveYear } from "@/utils/format";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;

type SortMode = "recent" | "title" | "author" | "rating";

const BASE_SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "recent", label: "Recently added" },
	{ value: "title", label: "Title" },
	{ value: "author", label: "Author" },
];

// "Top rated" sort and the star filter only make sense for ebooks — audiobooks
// carry no Amazon rating.
const RATING_SORT_OPTION: SortOption<SortMode> = {
	value: "rating",
	label: "Top rated",
};

const MIN_RATING_OPTIONS = [4, 3] as const;

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
	const [minRating, setMinRating] = useState<number | undefined>(undefined);

	const { data: library } = useQuery({
		...orpc.libraries.getLibraryById.queryOptions({ input: { id } }),
		staleTime: 30_000,
	});

	const isAudiobook = library?.mediaType === "audiobook";
	const mediaType = isAudiobook ? "audiobook" : "ebook";

	// Rating sort/filter is ebook-only; coerce a stale persisted "rating" sort and
	// drop any active rating filter so an audiobook library never queries by it.
	const effectiveSort: SortMode =
		isAudiobook && sort === "rating" ? "recent" : sort;
	const effectiveMinRating = isAudiobook ? undefined : minRating;
	const sortOptions = isAudiobook
		? BASE_SORT_OPTIONS
		: [...BASE_SORT_OPTIONS, RATING_SORT_OPTION];

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
				sort: effectiveSort,
				query: query || undefined,
				minRating: effectiveMinRating,
			}),
			getNextPageParam: (lastPage, _allPages, lastPageParam) =>
				lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
			initialPageParam: 0,
			staleTime: 30_000,
		}),
	);

	const { data: total } = useQuery({
		...orpc.books.countByLibrary.queryOptions({ input: { libraryId: id } }),
		staleTime: 30_000,
	});

	const books = useMemo(() => data?.pages.flat() ?? [], [data]);
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
				isSearching={isSearching || effectiveMinRating != null}
				query={query}
				sort={effectiveSort}
				onSortChange={setSort}
				sortOptions={sortOptions}
				sortAriaLabel="Sort books"
				extraActions={
					isAudiobook ? undefined : (
						<div className="flex items-center gap-1.5">
							{MIN_RATING_OPTIONS.map((r) => (
								<button
									key={r}
									type="button"
									aria-pressed={minRating === r}
									onClick={() =>
										setMinRating((cur) => (cur === r ? undefined : r))
									}
									className={cn(
										"inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-medium text-xs transition-colors",
										minRating === r
											? "bg-amber-400/90 text-black"
											: "bg-muted/70 text-foreground hover:bg-muted",
									)}
								>
									<Star className="size-3 fill-current" />
									{r}+
								</button>
							))}
						</div>
					)
				}
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
						description={
							query
								? `No books in this library match “${query}”.`
								: `No books in this library are rated ${effectiveMinRating}★ or higher.`
						}
					/>
				}
			/>
		</BookContextMenuRoot>
	);
}
