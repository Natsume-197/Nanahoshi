import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookCard } from "@/components/books/book-card";
import { createBookCardShellRowHeightEstimator } from "@/components/books/book-card-shell";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { CollectionSearch } from "@/components/shared/collection-search";
import {
	CollectionTableHeader,
	CollectionTableRow,
} from "@/components/shared/collection-table-row";
import { CollectionView } from "@/components/shared/collection-view";
import { EmptyState } from "@/components/shared/empty-state";
import {
	FilterBar,
	FilterField,
	type FilterOption,
	FilterSelect,
	MultiFilterSelect,
} from "@/components/shared/filter-bar";
import type { SortOption } from "@/components/shared/sort-select";
import { ViewToggle } from "@/components/shared/view-toggle";
import { useCollectionView } from "@/hooks/use-collection-view";
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

// "Top rated" sort and the rating filter only make sense for ebooks — audiobooks
// carry no Amazon rating.
const RATING_SORT_OPTION: SortOption<SortMode> = {
	value: "rating",
	label: "Top rated",
};

const RATING_OPTIONS: readonly FilterOption[] = [
	{ value: "any", label: "Any" },
	{ value: "4", label: "4★ & up" },
	{ value: "3", label: "3★ & up" },
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
	const [minRating, setMinRating] = useState<number | undefined>(undefined);
	const [genres, setGenres] = useState<string[]>([]);
	const [year, setYear] = useState<number | undefined>(undefined);

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

	const { data: facets } = useQuery({
		...orpc.books.libraryFacets.queryOptions({ input: { libraryId: id } }),
		staleTime: 30_000,
	});

	const yearOptions = useMemo<FilterOption[]>(
		() => [
			{ value: "any", label: "Any" },
			...(facets?.years ?? []).map((y) => ({
				value: String(y),
				label: String(y),
			})),
		],
		[facets?.years],
	);

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
				genres: genres.length > 0 ? genres : undefined,
				year,
			}),
			getNextPageParam: (lastPage, _allPages, lastPageParam) =>
				lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
			initialPageParam: 0,
			staleTime: 30_000,
		}),
	);

	const { data: total } = useQuery({
		...orpc.books.countByLibrary.queryOptions({
			input: {
				libraryId: id,
				query: query || undefined,
				minRating: effectiveMinRating,
				genres: genres.length > 0 ? genres : undefined,
				year,
			},
		}),
		staleTime: 30_000,
		placeholderData: keepPreviousData,
	});

	const books = useMemo(() => data?.pages.flat() ?? [], [data]);
	const gridRowEstimate = useMemo(
		() => createBookCardShellRowHeightEstimator({ square: isAudiobook }),
		[isAudiobook],
	);

	const hasActiveFilters =
		isSearching ||
		effectiveMinRating != null ||
		genres.length > 0 ||
		year != null;

	const filterBar = (
		<FilterBar>
			<FilterField label="Search" className="col-span-full lg:col-span-2">
				<CollectionSearch
					value={search}
					onChange={setSearch}
					placeholder="Search this library…"
					ariaLabel="Search books in this library"
					className="sm:w-full"
				/>
			</FilterField>
			<FilterField label="Genres">
				<MultiFilterSelect
					value={genres}
					options={facets?.genres ?? []}
					onChange={setGenres}
					ariaLabel="Filter by genre"
				/>
			</FilterField>
			<FilterField label="Year">
				<FilterSelect
					value={year != null ? String(year) : "any"}
					onChange={(v) => setYear(v === "any" ? undefined : Number(v))}
					options={yearOptions}
					ariaLabel="Filter by year"
				/>
			</FilterField>
			{!isAudiobook && (
				<FilterField label="Rating">
					<FilterSelect
						value={
							effectiveMinRating != null ? String(effectiveMinRating) : "any"
						}
						onChange={(v) => setMinRating(v === "any" ? undefined : Number(v))}
						options={RATING_OPTIONS}
						ariaLabel="Filter by minimum rating"
					/>
				</FilterField>
			)}
			<FilterField label="Sort">
				<FilterSelect
					value={effectiveSort}
					onChange={(v) => setSort(v as SortMode)}
					options={sortOptions}
					ariaLabel="Sort books"
				/>
			</FilterField>
			<FilterField label="View">
				<ViewToggle view={view} onChange={setView} fullWidth />
			</FilterField>
		</FilterBar>
	);

	return (
		<BookContextMenuRoot>
			<CollectionView
				title={library?.name ?? "Library"}
				subtitle={
					total != null
						? `${total} ${total === 1 ? "book" : "books"}`
						: undefined
				}
				isLoading={isLoading}
				isFetching={isFetching}
				isFetchingNextPage={isFetchingNextPage}
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder="Search this library…"
				searchAriaLabel="Search books in this library"
				isSearching={hasActiveFilters}
				query={query}
				sort={effectiveSort}
				onSortChange={setSort}
				sortOptions={sortOptions}
				sortAriaLabel="Sort books"
				filterBar={filterBar}
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
								: "No books in this library match the selected filters."
						}
					/>
				}
			/>
		</BookContextMenuRoot>
	);
}
