import { Tag } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	BookCardShell,
	createBookCardShellRowHeightEstimator,
} from "@/components/books/book-card-shell";
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
import { coverPresets, getCoverFilename } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;

type SortMode = "name" | "books" | "recent";

/** AniList-style split: genres are the coarse facet, tags the fine one. */
type Facet = "genres" | "tags";

/** Formats are a facet, never mixed: one format per listing. */
type Format = "ebook" | "audiobook";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "name", label: "Name" },
	{ value: "books", label: "Most books" },
	{ value: "recent", label: "Recently added" },
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
		"ebook",
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
	const gridRowEstimate = useMemo(
		() => createBookCardShellRowHeightEstimator({ square: isAudiobook }),
		[isAudiobook],
	);

	const detailLink = (uuid: string) =>
		isTags
			? ({ to: "/dashboard/tags/$uuid", params: { uuid } } as const)
			: ({ to: "/dashboard/genres/$uuid", params: { uuid } } as const);

	const entityBookCount = (count: number) =>
		isAudiobook
			? m["media.audiobook_count"]({ count })
			: m["media.book_count"]({ count });

	const filterBar = (
		<FilterBar>
			<FilterField
				label={m["library_page.search"]()}
				className="col-span-full lg:col-span-2"
			>
				<CollectionSearch
					value={search}
					onChange={setSearch}
					placeholder={isTags ? "Search tags…" : "Search genres…"}
					ariaLabel={isTags ? "Search tags" : "Search genres"}
					className="sm:w-full"
				/>
			</FilterField>
			<FilterField label="Type">
				<FilterSelect
					value={facet}
					onChange={(v) => setFacet(v as Facet)}
					options={facetOptions}
					ariaLabel="Filter by type"
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
			title={isTags ? "Tags" : "Genres"}
			subtitle={total ? `${total} ${isTags ? "tags" : "genres"}` : undefined}
			isLoading={isLoading}
			isFetching={isFetching}
			isFetchingNextPage={isFetchingNextPage}
			search={search}
			onSearchChange={setSearch}
			searchPlaceholder={isTags ? "Search tags…" : "Search genres…"}
			searchAriaLabel={isTags ? "Search tags" : "Search genres"}
			isSearching={isSearching || isAudiobook}
			query={query}
			sort={sort}
			onSortChange={setSort}
			sortOptions={SORT_OPTIONS}
			sortAriaLabel={isTags ? "Sort tags" : "Sort genres"}
			filterBar={filterBar}
			view={view}
			onViewChange={setView}
			items={entities}
			getKey={(g) => g.uuid}
			hasNextPage={hasNextPage}
			fetchNextPage={fetchNextPage}
			gridRowEstimate={gridRowEstimate}
			renderGridItem={(g) => (
				<BookCardShell
					linkProps={{ ...detailLink(g.uuid), preload: "intent" }}
					ariaLabel={g.name}
					coverFilename={getCoverFilename(g.cover) ?? undefined}
					coverPreset={coverPresets.small}
					square={isAudiobook}
					fallback={
						<div className="flex h-full w-full items-center justify-center">
							<Tag className="size-8 text-muted-foreground/40" />
						</div>
					}
					title={g.name}
					subtitle={entityBookCount(g.bookCount)}
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
					title={g.name}
					subtitle={entityBookCount(g.bookCount)}
					meta={g.bookCount}
				/>
			)}
			emptyState={
				<EmptyState
					title={isTags ? "No tags found" : "No genres found"}
					description={
						isTags
							? "Tags will appear here once your books are enriched with metadata."
							: "Genres will appear here once your books are enriched with metadata."
					}
				/>
			}
			searchEmptyState={
				<EmptyState
					title="No matches"
					description={
						query
							? `No ${isTags ? "tags" : "genres"} match “${query}”.`
							: m["library_page.no_filter_matches"]()
					}
				/>
			}
		/>
	);
}
