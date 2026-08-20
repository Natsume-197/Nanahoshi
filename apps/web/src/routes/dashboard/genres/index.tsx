import { Tag } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	estimateGenreTileRowHeight,
	GENRE_TILE_GRID,
	GenreTile,
	GenreTileSkeletonGrid,
} from "@/components/catalog/genre-tile";
import { QueryErrorState } from "@/components/libraries/query-error-state";
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
} from "@/components/shared/filter-bar";
import type { SortOption } from "@/components/shared/sort-select";
import { ViewToggle } from "@/components/shared/view-toggle";
import { useCollectionView } from "@/hooks/use-collection-view";
import { useUiSnapshotState } from "@/hooks/use-ui-snapshot-state";
import { m } from "@/paraglide/messages";
import { getCoverFilename } from "@/utils/covers";
import { capitalizeFirst } from "@/utils/format";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;

type SortMode = "name" | "books" | "recent";

/** AniList-style split: genres are the coarse facet, tags the fine one. */
type Facet = "genres" | "tags";

type Format = "all" | "ebook" | "audiobook";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "name", label: m["common.title"]() },
	{ value: "books", label: m["nav.books"]() },
	{ value: "recent", label: m["library_page.sort_recently_added"]() },
];

export const Route = createFileRoute("/dashboard/genres/")({
	component: GenresPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function GenresPage() {
	const [facet, setFacet] = useUiSnapshotState<Facet>("genres-facet", "genres");
	const [format, setFormat] = useUiSnapshotState<Format>(
		"genres-format",
		"all",
	);
	const isTags = facet === "tags";
	const isAudiobook = format === "audiobook";

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
		storageKey: "nh-genres-view",
		defaultSort: "name",
	});

	const facetOptions: readonly FilterOption[] = [
		{ value: "genres", label: m["nav.genres"]() },
		{ value: "tags", label: m["library_page.tags"]() },
	];
	const formatOptions: readonly FilterOption[] = [
		{ value: "all", label: m["media.all_formats"]() },
		{ value: "ebook", label: m["search.books"]() },
		{ value: "audiobook", label: m["search.audiobooks"]() },
	];

	const listInput = (pageParam: number) => ({
		limit: PAGE_SIZE,
		cursor: pageParam,
		sort,
		query: query || undefined,
		mediaType: format,
	});
	const listPagination = {
		getNextPageParam: (
			lastPage: unknown[],
			_allPages: unknown[][],
			lastPageParam: number,
		) =>
			lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
		initialPageParam: 0,
		staleTime: 30_000,
	};

	const {
		data,
		isLoading,
		isFetching,
		hasNextPage,
		fetchNextPage,
		isFetchingNextPage,
		isError,
		refetch,
	} = useInfiniteQuery(
		isTags
			? orpc.tags.list.infiniteOptions({ input: listInput, ...listPagination })
			: orpc.genres.list.infiniteOptions({
					input: listInput,
					...listPagination,
				}),
	);

	const { data: total } = useQuery({
		...(isTags
			? orpc.tags.count.queryOptions({ input: { mediaType: format } })
			: orpc.genres.count.queryOptions({ input: { mediaType: format } })),
		staleTime: 30_000,
	});

	const entities = useMemo(() => data?.pages.flat() ?? [], [data]);

	const detailLink = (uuid: string) =>
		isTags
			? ({ to: "/dashboard/tags/$uuid", params: { uuid } } as const)
			: ({ to: "/dashboard/genres/$uuid", params: { uuid } } as const);

	const entityBookCount = (count: number) => {
		if (format === "all") return m["media.item_count"]({ count });
		return isAudiobook
			? m["media.audiobook_count"]({ count })
			: m["media.book_count"]({ count });
	};

	const filterBar = (
		<FilterBar>
			<FilterField
				label={m["library_page.search"]()}
				className="col-span-full lg:col-span-2"
			>
				<CollectionSearch
					value={search}
					onChange={setSearch}
					placeholder={
						isTags
							? m["catalog_pages.search_tags"]()
							: m["catalog_pages.search_genres"]()
					}
					ariaLabel={
						isTags
							? m["catalog_pages.search_tags"]()
							: m["catalog_pages.search_genres"]()
					}
					className="sm:w-full"
				/>
			</FilterField>
			<FilterField label={m["catalog_pages.type"]()}>
				<FilterSelect
					value={facet}
					onChange={(v) => setFacet(v as Facet)}
					options={facetOptions}
					ariaLabel={m["catalog_pages.type"]()}
				/>
			</FilterField>
			<FilterField label={m["media.format"]()}>
				<FilterSelect
					value={format}
					onChange={(v) => setFormat(v as Format)}
					options={formatOptions}
					ariaLabel={m["media.format"]()}
				/>
			</FilterField>
			<FilterField label={m["common.sort"]()}>
				<FilterSelect
					value={sort}
					onChange={(v) => setSort(v as SortMode)}
					options={SORT_OPTIONS}
					ariaLabel={isTags ? "Sort tags" : "Sort genres"}
				/>
			</FilterField>
			<FilterField label={m["library_page.view"]()}>
				<ViewToggle view={view} onChange={setView} fullWidth />
			</FilterField>
		</FilterBar>
	);

	return (
		<CollectionView
			title={isTags ? m["catalog_pages.tags"]() : m["catalog_pages.genres"]()}
			subtitle={total ? m["media.item_count"]({ count: total }) : undefined}
			isLoading={isLoading}
			isError={isError}
			errorState={<QueryErrorState onRetry={() => void refetch()} />}
			isFetching={isFetching}
			isFetchingNextPage={isFetchingNextPage}
			search={search}
			onSearchChange={setSearch}
			searchPlaceholder={
				isTags
					? m["catalog_pages.search_tags"]()
					: m["catalog_pages.search_genres"]()
			}
			searchAriaLabel={
				isTags
					? m["catalog_pages.search_tags"]()
					: m["catalog_pages.search_genres"]()
			}
			isSearching={isSearching || isAudiobook}
			query={query}
			sort={sort}
			onSortChange={setSort}
			sortOptions={SORT_OPTIONS}
			sortAriaLabel={m["common.sort"]()}
			filterBar={filterBar}
			view={view}
			onViewChange={setView}
			items={entities}
			getKey={(g) => g.uuid}
			hasNextPage={hasNextPage}
			fetchNextPage={fetchNextPage}
			gridRowEstimate={estimateGenreTileRowHeight}
			gridLayout={GENRE_TILE_GRID}
			gridSkeleton={<GenreTileSkeletonGrid />}
			renderGridItem={(g) => (
				<GenreTile
					linkProps={{ ...detailLink(g.uuid), preload: "intent" }}
					name={capitalizeFirst(g.name)}
					subtitle={entityBookCount(g.bookCount)}
					coverFilename={getCoverFilename(g.cover) ?? undefined}
					tint={g.mainColor}
					square={g.square}
				/>
			)}
			listHeader={
				<CollectionTableHeader withAuthor={false} metaLabel="Books" />
			}
			renderListItem={(g, index) => (
				<CollectionTableRow
					withAuthor={false}
					index={index + 1}
					linkProps={detailLink(g.uuid)}
					coverFilename={getCoverFilename(g.cover)}
					coverFallback={<Tag className="size-4 text-muted-foreground/40" />}
					title={capitalizeFirst(g.name)}
					subtitle={entityBookCount(g.bookCount)}
					meta={g.bookCount}
				/>
			)}
			emptyState={
				<EmptyState
					title={
						isTags
							? m["catalog_pages.no_tags"]()
							: m["catalog_pages.no_genres"]()
					}
					description={m["catalog_pages.metadata_empty"]()}
				/>
			}
			searchEmptyState={
				<EmptyState
					title={m["catalog_pages.no_matches"]()}
					description={
						query
							? m["catalog_pages.no_query_matches"]({ query })
							: m["library_page.no_filter_matches"]()
					}
				/>
			}
		/>
	);
}
