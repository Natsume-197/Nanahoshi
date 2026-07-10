import { Tag } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	BookCardShell,
	createBookCardShellRowHeightEstimator,
} from "@/components/books/book-card-shell";
import {
	CollectionTableHeader,
	CollectionTableRow,
} from "@/components/shared/collection-table-row";
import { CollectionView } from "@/components/shared/collection-view";
import { EmptyState } from "@/components/shared/empty-state";
import type { SortOption } from "@/components/shared/sort-select";
import { useCollectionView } from "@/hooks/use-collection-view";
import { cn } from "@/lib/utils";
import { coverPresets, getCoverFilename } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;
const GENRE_CARD_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

type SortMode = "name" | "books" | "recent";

/** AniList-style split: genres are the coarse facet, tags the fine one. */
type Facet = "genres" | "tags";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "name", label: "Name" },
	{ value: "books", label: "Most books" },
	{ value: "recent", label: "Recently added" },
];

const genreBookCount = (count: number) =>
	`${count} ${count === 1 ? "book" : "books"}`;

function FacetToggle({
	facet,
	onChange,
}: {
	facet: Facet;
	onChange: (next: Facet) => void;
}) {
	return (
		<div className="flex items-center gap-0.5 rounded-2xl bg-input/50 p-1">
			{(["genres", "tags"] as const).map((value) => (
				<button
					key={value}
					type="button"
					aria-pressed={facet === value}
					onClick={() => onChange(value)}
					className={cn(
						"flex h-7 items-center justify-center rounded-xl px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
						facet === value
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{value === "genres" ? "Genres" : "Tags"}
				</button>
			))}
		</div>
	);
}

export const Route = createFileRoute("/dashboard/genres/")({
	component: GenresPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function GenresPage() {
	const [facet, setFacet] = useState<Facet>("genres");
	const isTags = facet === "tags";

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

	const listInput = (pageParam: number) => ({
		limit: PAGE_SIZE,
		cursor: pageParam,
		sort,
		query: query || undefined,
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
			? orpc.tags.count.queryOptions()
			: orpc.genres.count.queryOptions()),
		staleTime: 30_000,
	});

	const entities = useMemo(() => data?.pages.flat() ?? [], [data]);

	const detailLink = (uuid: string) =>
		isTags
			? ({ to: "/dashboard/tags/$uuid", params: { uuid } } as const)
			: ({ to: "/dashboard/genres/$uuid", params: { uuid } } as const);

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
			isSearching={isSearching}
			query={query}
			sort={sort}
			onSortChange={setSort}
			sortOptions={SORT_OPTIONS}
			sortAriaLabel={isTags ? "Sort tags" : "Sort genres"}
			hideSortWhileSearching
			extraActions={<FacetToggle facet={facet} onChange={setFacet} />}
			view={view}
			onViewChange={setView}
			items={entities}
			getKey={(g) => g.uuid}
			hasNextPage={hasNextPage}
			fetchNextPage={fetchNextPage}
			gridRowEstimate={GENRE_CARD_ROW_ESTIMATE}
			renderGridItem={(g) => (
				<BookCardShell
					linkProps={{ ...detailLink(g.uuid), preload: "intent" }}
					ariaLabel={g.name}
					coverFilename={getCoverFilename(g.cover) ?? undefined}
					coverPreset={coverPresets.small}
					fallback={
						<div className="flex h-full w-full items-center justify-center">
							<Tag className="size-8 text-muted-foreground/40" />
						</div>
					}
					title={g.name}
					subtitle={genreBookCount(g.bookCount)}
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
					subtitle={genreBookCount(g.bookCount)}
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
					description={`No ${isTags ? "tags" : "genres"} match “${query}”.`}
				/>
			}
		/>
	);
}
