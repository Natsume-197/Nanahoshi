import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
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
import type { MediaType } from "@/hooks/books/use-toggle-like";
import { useCollectionView } from "@/hooks/use-collection-view";
import { m } from "@/paraglide/messages";
import { getCoverFilename } from "@/utils/covers";
import { resolveYear } from "@/utils/format";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;

type SortMode = "recent" | "title" | "author" | "rating";

/** Format facet of the all-items catalog. */
export type CatalogFormat = "all" | "ebook" | "audiobook";

/**
 * What the catalog is scoped to. `all` lists every book/audiobook in the server
 * (no genre/year/rating filters) with a format facet owned by the caller;
 * `library` lists one library and exposes the full AniList-style filter bar
 * driven by that library's facets.
 */
export type CatalogSource =
	| {
			kind: "all";
			format: CatalogFormat;
			onFormatChange: (format: CatalogFormat) => void;
	  }
	| { kind: "library"; libraryUuid: string };

export function CatalogView({ source }: { source: CatalogSource }) {
	const isLibrary = source.kind === "library";
	const libraryUuid = isLibrary ? source.libraryUuid : undefined;

	const { data: library } = useQuery({
		...orpc.libraries.getLibraryByUuid.queryOptions({
			input: { uuid: libraryUuid ?? "" },
		}),
		enabled: isLibrary,
		staleTime: 30_000,
	});

	// For a library the media type is derived from the loaded entity; for the
	// all-catalog view it's the caller-owned format facet ("all" mixes both).
	const format: CatalogFormat = isLibrary
		? library?.mediaType === "audiobook"
			? "audiobook"
			: "ebook"
		: source.format;
	const isAudiobook = format === "audiobook";
	const mediaType: MediaType = isAudiobook ? "audiobook" : "ebook";

	const storageKey = isLibrary ? "nh-library-view" : "nh-books-view";

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
		storageKey,
		defaultSort: "recent",
	});

	// Library-only filters. Unused (and unrendered) for the all-catalog view.
	const [minRating, setMinRating] = useState<number | undefined>(undefined);
	const [genres, setGenres] = useState<string[]>([]);
	const [tags, setTags] = useState<string[]>([]);
	const [year, setYear] = useState<number | undefined>(undefined);

	const baseSortOptions: readonly SortOption<SortMode>[] = [
		{ value: "recent", label: m["library_page.sort_recently_added"]() },
		{ value: "title", label: m["common.title"]() },
		{ value: "author", label: m["common.author"]() },
	];
	const ratingSortOption: SortOption<SortMode> = {
		value: "rating",
		label: m["library_page.sort_top_rated"](),
	};
	const ratingOptions: readonly FilterOption[] = [
		{ value: "any", label: m["library_page.rating_any"]() },
		{ value: "4", label: "4★ & up" },
		{ value: "3", label: "3★ & up" },
	];
	const formatOptions: readonly FilterOption[] = [
		{ value: "all", label: m["search.all"]() },
		{ value: "ebook", label: m["search.books"]() },
		{ value: "audiobook", label: m["search.audiobooks"]() },
	];

	// Rating sort/filter is ebook-only; coerce a stale persisted "rating" sort and
	// drop any active rating filter so an audiobook catalog never queries by it.
	const effectiveSort: SortMode =
		isAudiobook && sort === "rating" ? "recent" : sort;
	const effectiveMinRating = isAudiobook ? undefined : minRating;
	const sortOptions = isAudiobook
		? baseSortOptions
		: [...baseSortOptions, ratingSortOption];

	const { data: facets } = useQuery({
		...orpc.books.libraryFacets.queryOptions({
			input: { libraryUuid: libraryUuid ?? "" },
		}),
		enabled: isLibrary,
		staleTime: 30_000,
	});

	const yearOptions = useMemo<FilterOption[]>(
		() => [
			{ value: "any", label: m["common.any"]() },
			...(facets?.years ?? []).map((y) => ({
				value: String(y),
				label: String(y),
			})),
		],
		[facets?.years],
	);

	// The two catalogs return different row shapes (only listAll carries
	// mediaType), so they stay separate queries — a union of infiniteOptions
	// isn't resolvable. Only the active one is enabled.
	const libraryListQuery = useInfiniteQuery({
		...orpc.books.listByLibrary.infiniteOptions({
			input: (pageParam: number) => ({
				libraryUuid: libraryUuid ?? "",
				limit: PAGE_SIZE,
				cursor: pageParam,
				sort: effectiveSort,
				query: query || undefined,
				minRating: effectiveMinRating,
				genres: genres.length > 0 ? genres : undefined,
				tags: tags.length > 0 ? tags : undefined,
				year,
			}),
			getNextPageParam: (lastPage, _allPages, lastPageParam) =>
				lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
			initialPageParam: 0,
			staleTime: 30_000,
		}),
		enabled: isLibrary,
	});

	const allListQuery = useInfiniteQuery({
		...orpc.books.listAll.infiniteOptions({
			input: (pageParam: number) => ({
				mediaType: format,
				limit: PAGE_SIZE,
				cursor: pageParam,
				sort: effectiveSort,
				query: query || undefined,
			}),
			getNextPageParam: (lastPage, _allPages, lastPageParam) =>
				lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
			initialPageParam: 0,
			staleTime: 30_000,
		}),
		enabled: !isLibrary,
	});

	const { isLoading, isFetching, hasNextPage, isFetchingNextPage } = isLibrary
		? libraryListQuery
		: allListQuery;
	const fetchNextPage = isLibrary
		? libraryListQuery.fetchNextPage
		: allListQuery.fetchNextPage;

	const countOptions = isLibrary
		? orpc.books.countByLibrary.queryOptions({
				input: {
					libraryUuid: libraryUuid ?? "",
					query: query || undefined,
					minRating: effectiveMinRating,
					genres: genres.length > 0 ? genres : undefined,
					tags: tags.length > 0 ? tags : undefined,
					year,
				},
			})
		: orpc.books.countAll.queryOptions({
				input: { mediaType: format, query: query || undefined },
			});

	const { data: total } = useQuery({
		...countOptions,
		staleTime: 30_000,
		placeholderData: keepPreviousData,
	});

	// Mixed-catalog rows carry their own media type; library rows fall back to
	// the page-level one so cards, links and context menus stay format-correct.
	// Each list normalizes its own rows so both end up the same shape.
	const libraryBooks = useMemo(
		() =>
			(libraryListQuery.data?.pages.flat() ?? []).map((book) => ({
				...book,
				mediaType,
			})),
		[libraryListQuery.data, mediaType],
	);
	const allBooks = useMemo(
		() =>
			(allListQuery.data?.pages.flat() ?? []).map((book) => ({
				...book,
				mediaType: book.mediaType ?? mediaType,
			})),
		[allListQuery.data, mediaType],
	);
	// Both lists normalize to the same row shape; anchoring the type keeps the
	// literal mediaType union from widening to string via generic inference.
	const books: typeof allBooks = isLibrary ? libraryBooks : allBooks;
	const gridRowEstimate = useMemo(
		() => createBookCardShellRowHeightEstimator({ square: isAudiobook }),
		[isAudiobook],
	);

	const title = isLibrary
		? (library?.name ?? m["library_page.title_fallback"]())
		: format === "all"
			? m["nav.browse"]()
			: format === "audiobook"
				? m["home.all_audiobooks"]()
				: m["home.all_books"]();

	const subtitle =
		total != null
			? format === "all"
				? m["media.item_count"]({ count: total })
				: isAudiobook
					? m["media.audiobook_count"]({ count: total })
					: m["media.book_count"]({ count: total })
			: undefined;

	const hasActiveFilters =
		isSearching ||
		effectiveMinRating != null ||
		genres.length > 0 ||
		tags.length > 0 ||
		year != null;

	const filterBar = isLibrary ? (
		<FilterBar>
			<FilterField
				label={m["library_page.search"]()}
				className="col-span-full lg:col-span-2"
			>
				<CollectionSearch
					value={search}
					onChange={setSearch}
					placeholder={m["library_page.search_placeholder"]()}
					ariaLabel={m["library_page.search_aria"]()}
					className="sm:w-full"
				/>
			</FilterField>
			<FilterField label={m["library_page.genres"]()}>
				<MultiFilterSelect
					value={genres}
					options={facets?.genres ?? []}
					onChange={setGenres}
					ariaLabel={m["library_page.filter_genre_aria"]()}
				/>
			</FilterField>
			{(facets?.tags?.length ?? 0) > 0 && (
				<FilterField label={m["library_page.tags"]()}>
					<MultiFilterSelect
						value={tags}
						options={facets?.tags ?? []}
						onChange={setTags}
						ariaLabel={m["library_page.filter_tag_aria"]()}
					/>
				</FilterField>
			)}
			<FilterField label={m["library_page.year"]()}>
				<FilterSelect
					value={year != null ? String(year) : "any"}
					onChange={(v) => setYear(v === "any" ? undefined : Number(v))}
					options={yearOptions}
					ariaLabel={m["library_page.filter_year_aria"]()}
				/>
			</FilterField>
			{!isAudiobook && (
				<FilterField label={m["library_page.rating"]()}>
					<FilterSelect
						value={
							effectiveMinRating != null ? String(effectiveMinRating) : "any"
						}
						onChange={(v) => setMinRating(v === "any" ? undefined : Number(v))}
						options={ratingOptions}
						ariaLabel={m["library_page.filter_rating_aria"]()}
					/>
				</FilterField>
			)}
			<FilterField label={m["common.sort"]()}>
				<FilterSelect
					value={effectiveSort}
					onChange={(v) => setSort(v as SortMode)}
					options={sortOptions}
					ariaLabel={m["library_page.sort_aria"]()}
				/>
			</FilterField>
			<FilterField label={m["library_page.view"]()}>
				<ViewToggle view={view} onChange={setView} fullWidth />
			</FilterField>
		</FilterBar>
	) : (
		<FilterBar>
			<FilterField
				label={m["library_page.search"]()}
				className="col-span-full lg:col-span-2"
			>
				<CollectionSearch
					value={search}
					onChange={setSearch}
					placeholder={m["library_page.search_placeholder"]()}
					ariaLabel={m["library_page.search_aria"]()}
					className="sm:w-full"
				/>
			</FilterField>
			<FilterField label={m["media.format"]()}>
				<FilterSelect
					value={format}
					onChange={(v) => source.onFormatChange(v as CatalogFormat)}
					options={formatOptions}
					ariaLabel={m["media.format"]()}
				/>
			</FilterField>
			<FilterField label={m["common.sort"]()}>
				<FilterSelect
					value={effectiveSort}
					onChange={(v) => setSort(v as SortMode)}
					options={sortOptions}
					ariaLabel={m["library_page.sort_aria"]()}
				/>
			</FilterField>
			<FilterField label={m["library_page.view"]()}>
				<ViewToggle view={view} onChange={setView} fullWidth />
			</FilterField>
		</FilterBar>
	);

	return (
		<BookContextMenuRoot>
			<CollectionView
				title={title}
				subtitle={subtitle}
				isLoading={isLoading}
				isFetching={isFetching}
				isFetchingNextPage={isFetchingNextPage}
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder={m["library_page.search_placeholder"]()}
				searchAriaLabel={m["library_page.search_aria"]()}
				isSearching={hasActiveFilters}
				query={query}
				sort={effectiveSort}
				onSortChange={setSort}
				sortOptions={sortOptions}
				sortAriaLabel={m["library_page.sort_aria"]()}
				filterBar={filterBar}
				view={view}
				onViewChange={setView}
				items={books}
				getKey={(book) => book.uuid}
				hasNextPage={hasNextPage}
				fetchNextPage={fetchNextPage}
				gridRowEstimate={gridRowEstimate}
				renderGridItem={(book) => (
					<BookContextMenuTrigger
						bookUuid={book.uuid}
						mediaType={book.mediaType}
					>
						<BookCard
							uuid={book.uuid}
							title={book.title}
							filename={book.filename}
							cover={book.cover}
							authors={book.authors}
							mediaType={book.mediaType}
							contextMenuEnabled={false}
						/>
					</BookContextMenuTrigger>
				)}
				listHeader={
					<CollectionTableHeader
						metaLabel={m["library_page.list_meta_year"]()}
					/>
				}
				renderListItem={(book, index) => (
					<BookContextMenuTrigger
						bookUuid={book.uuid}
						mediaType={book.mediaType}
					>
						<CollectionTableRow
							index={index + 1}
							linkProps={
								book.mediaType === "audiobook"
									? {
											to: "/dashboard/audiobooks/$uuid",
											params: { uuid: book.uuid },
										}
									: {
											to: "/dashboard/books/$uuid",
											params: { uuid: book.uuid },
										}
							}
							coverFilename={getCoverFilename(book.cover)}
							title={book.title ?? book.filename}
							authors={book.authors}
							meta={resolveYear(book.publishedDate)}
						/>
					</BookContextMenuTrigger>
				)}
				emptyState={
					<EmptyState
						title={m["library_page.empty_title"]()}
						description={m["library_page.empty_desc"]()}
					/>
				}
				searchEmptyState={
					<EmptyState
						title={m["settings.no_matches"]()}
						description={
							query
								? m["library_page.no_query_matches"]({ query })
								: m["library_page.no_filter_matches"]()
						}
					/>
				}
			/>
		</BookContextMenuRoot>
	);
}
