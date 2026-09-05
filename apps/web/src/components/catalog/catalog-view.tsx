import type { DynamicCollectionDefinitionV1 } from "@nanahoshi-v2/api/routers/collections/collection-rules";
import { FunnelSimple } from "@phosphor-icons/react";
import {
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookCard } from "@/components/books/book-card";
import { createBookCardShellRowHeightEstimator } from "@/components/books/book-card-shell";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { SurpriseButton } from "@/components/catalog/surprise-button";
import { QueryErrorState } from "@/components/libraries/query-error-state";
import { CollectionSearch } from "@/components/shared/collection-search";
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
import { Button } from "@/components/ui/button";
import type { MediaType } from "@/hooks/books/use-toggle-like";
import { useCollectionView } from "@/hooks/use-collection-view";
import { useOnUnmount } from "@/hooks/use-on-unmount";
import { useSession } from "@/hooks/use-session";
import {
	getLocationRestoreKey,
	readUiSnapshot,
	saveUiSnapshot,
} from "@/lib/scroll-restoration";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { allCatalogOptions, retainCatalogData } from "./catalog-queries";

const PAGE_SIZE = 30;

type SortMode = "recent" | "title" | "author" | "rating";

/** What the catalog lists; each format has its own route. */
export type CatalogFormat = "ebook" | "audiobook";

/**
 * What the catalog is scoped to. `all` lists one format across every library
 * (no genre/year/rating filters), narrowable by the caller-owned library facet;
 * `library` lists one library and exposes the full AniList-style filter bar
 * driven by that library's facets.
 */
export type CatalogSource =
	| {
			kind: "all";
			format: CatalogFormat;
			libraryUuid?: string;
			onLibraryChange: (libraryUuid: string | undefined) => void;
	  }
	| { kind: "library"; libraryUuid: string };

export function CatalogView({ source }: { source: CatalogSource }) {
	const isLibrary = source.kind === "library";
	const libraryUuid = isLibrary ? source.libraryUuid : undefined;
	const libraryFilter = isLibrary ? undefined : source.libraryUuid;

	const { data: library } = useQuery({
		...orpc.libraries.getLibraryByUuid.queryOptions({
			input: { uuid: libraryUuid ?? "" },
		}),
		enabled: isLibrary,
	});

	// For a library the media type is derived from the loaded entity; for the
	// all-catalog view the route pins it.
	const format: CatalogFormat = isLibrary
		? library?.mediaType === "audiobook"
			? "audiobook"
			: "ebook"
		: source.format;
	const isAudiobook = format === "audiobook";
	const mediaType: MediaType = isAudiobook ? "audiobook" : "ebook";

	const storageKey = isLibrary ? "nh-library-view" : "nh-books-view";

	const { sort, setSort, search, setSearch, query, isSearching } =
		useCollectionView<SortMode>({
			storageKey,
			defaultSort: "recent",
		});

	// Library-only filters. Unused (and unrendered) for the all-catalog view.
	// Snapshotted per history entry (like sort/search in useCollectionView) so
	// a back-nav rebuilds the same query key and the cached list rehydrates.
	const router = useRouter();
	const [filterSnapshotKey] = useState(
		() => `${getLocationRestoreKey(router.latestLocation)}:catalog-filters`,
	);
	const [savedFilters] = useState(() =>
		readUiSnapshot<{
			minRating?: number;
			genres: string[];
			tags: string[];
			year?: number;
		}>(filterSnapshotKey),
	);
	const [minRating, setMinRating] = useState<number | undefined>(
		savedFilters?.minRating,
	);
	const [genres, setGenres] = useState<string[]>(savedFilters?.genres ?? []);
	const [tags, setTags] = useState<string[]>(savedFilters?.tags ?? []);
	const [year, setYear] = useState<number | undefined>(savedFilters?.year);

	useOnUnmount(() =>
		saveUiSnapshot(filterSnapshotKey, { minRating, genres, tags, year }),
	);

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
	});

	const { data: allLibraries } = useQuery({
		...orpc.libraries.getLibraries.queryOptions(),
		staleTime: 30_000,
		enabled: !isLibrary,
	});
	const libraryOptions = useMemo<FilterOption[]>(
		() => [
			{ value: "any", label: m["common.any"]() },
			...(allLibraries ?? [])
				.filter((lib) => lib.mediaType === format)
				.map((lib) => ({
					value: lib.uuid,
					label: lib.name ?? m["library.untitled"](),
				})),
		],
		[allLibraries, format],
	);

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

	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const catalogScope = JSON.stringify([
		session?.user.id,
		session?.session.activeOrganizationId,
		source.kind,
		libraryUuid,
		format,
	]);
	const placeholderOptions = {
		meta: { catalogScope },
		placeholderData: <T,>(
			data: T | undefined,
			previousQuery: Parameters<typeof retainCatalogData>[1],
		) =>
			retainCatalogData(
				data,
				previousQuery,
				catalogScope,
				queryClient.getQueryCache(),
			),
	};

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
		}),
		...placeholderOptions,
		enabled: isLibrary,
	});

	const allListQuery = useInfiniteQuery({
		...allCatalogOptions({
			format,
			sort: effectiveSort,
			query,
			libraryUuid: libraryFilter,
		}),
		...placeholderOptions,
		enabled: !isLibrary,
	});

	const {
		isLoading,
		isFetching,
		hasNextPage,
		isFetchingNextPage,
		isPlaceholderData,
		isError,
		refetch,
	} = isLibrary ? libraryListQuery : allListQuery;
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
				input: {
					mediaType: format,
					query: query || undefined,
					libraryUuid: libraryFilter,
				},
			});

	// Catalog queries ride the client's default staleTime: scan completions
	// blanket-invalidate (use-task-events), so a short staleTime only re-runs
	// the heaviest list queries on every section hop.
	const { data: total } = useQuery({
		...countOptions,
		...placeholderOptions,
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
		: isAudiobook
			? m["home.all_audiobooks"]()
			: m["home.all_books"]();

	const subtitle =
		total != null
			? isAudiobook
				? m["media.audiobook_count"]({ count: total })
				: m["media.book_count"]({ count: total })
			: undefined;

	const hasActiveFilters =
		isSearching ||
		effectiveMinRating != null ||
		genres.length > 0 ||
		tags.length > 0 ||
		year != null;
	const dynamicDraft = useMemo<DynamicCollectionDefinitionV1>(() => {
		const children: DynamicCollectionDefinitionV1["root"]["children"] = [
			{
				kind: "rule",
				field: "mediaType",
				operator: "includesAny",
				value: [format],
			},
		];
		if (query) {
			children.push({
				kind: "group",
				match: "any",
				children: [
					{ kind: "rule", field: "title", operator: "contains", value: query },
					{
						kind: "rule",
						field: "filename",
						operator: "contains",
						value: query,
					},
				],
			});
		}
		const selectedLibraryUuid = libraryUuid ?? libraryFilter;
		if (selectedLibraryUuid) {
			children.push({
				kind: "rule",
				field: "library",
				operator: "includesAny",
				value: [
					{
						id: selectedLibraryUuid,
						label:
							library?.name ??
							allLibraries?.find((item) => item.uuid === selectedLibraryUuid)
								?.name ??
							"Library",
					},
				],
			});
		}
		if (year != null)
			children.push({
				kind: "rule",
				field: "publishedYear",
				operator: "equals",
				value: year,
			});
		if (effectiveMinRating != null)
			children.push({
				kind: "rule",
				field: "communityRating",
				operator: "gte",
				value: effectiveMinRating,
			});
		const field =
			effectiveSort === "recent"
				? "addedAt"
				: effectiveSort === "author"
					? "primaryAuthor"
					: effectiveSort === "rating"
						? "communityRating"
						: "title";
		return {
			version: 1,
			root: { kind: "group", match: "all", children },
			sort: [
				{
					field,
					direction:
						effectiveSort === "recent" || effectiveSort === "rating"
							? "desc"
							: "asc",
				},
			],
		};
	}, [
		allLibraries,
		effectiveMinRating,
		effectiveSort,
		format,
		library?.name,
		libraryFilter,
		libraryUuid,
		query,
		year,
	]);
	const cannotSaveFilters = genres.length > 0 || tags.length > 0;
	const saveDynamicAction = (
		<Button
			type="button"
			variant="outline"
			disabled={cannotSaveFilters}
			title={
				cannotSaveFilters
					? "Clear genre and tag filters before saving; this catalog currently exposes their names, not stable identities."
					: undefined
			}
			render={
				cannotSaveFilters ? undefined : (
					<Link
						to="/dashboard/collections/new"
						search={{ draft: JSON.stringify(dynamicDraft) }}
					/>
				)
			}
		>
			<FunnelSimple data-icon="inline-start" />
			{m["collection.save_as_dynamic"]()}
		</Button>
	);

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
			{libraryOptions.length > 2 && (
				<FilterField label={m["nav.library"]()}>
					<FilterSelect
						value={libraryFilter ?? "any"}
						onChange={(v) =>
							!isLibrary && source.onLibraryChange(v === "any" ? undefined : v)
						}
						options={libraryOptions}
						ariaLabel={m["library_page.filter_library_aria"]()}
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
		</FilterBar>
	);

	return (
		<BookContextMenuRoot>
			<CollectionView
				title={title}
				subtitle={subtitle}
				isLoading={isLoading}
				isError={isError}
				errorState={<QueryErrorState onRetry={() => void refetch()} />}
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
				extraActions={
					<>
						{saveDynamicAction}
						{!isLibrary && <SurpriseButton format={format} />}
					</>
				}
				items={books}
				getKey={(book) => book.uuid}
				hasNextPage={hasNextPage && !isPlaceholderData}
				fetchNextPage={() => {
					if (!isPlaceholderData && !isFetching) void fetchNextPage();
				}}
				gridRowEstimate={gridRowEstimate}
				squareArtwork={isAudiobook}
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
							coverFrameRatio={isAudiobook ? "square" : "book"}
							tint={book.mainColor}
							contextMenuEnabled={false}
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
