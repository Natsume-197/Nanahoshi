import { Tag } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
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
import { coverPresets, getCoverFilename } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;
const GENRE_CARD_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

type SortMode = "name" | "books" | "recent";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "name", label: "Name" },
	{ value: "books", label: "Most books" },
	{ value: "recent", label: "Recently added" },
];

const genreBookCount = (count: number) =>
	`${count} ${count === 1 ? "book" : "books"}`;

export const Route = createFileRoute("/dashboard/genres/")({
	component: GenresPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function GenresPage() {
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

	const {
		data,
		isLoading,
		isFetching,
		hasNextPage,
		fetchNextPage,
		isFetchingNextPage,
	} = useInfiniteQuery(
		orpc.genres.list.infiniteOptions({
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
		...orpc.genres.count.queryOptions(),
		staleTime: 30_000,
	});

	const genresList = useMemo(() => data?.pages.flat() ?? [], [data]);

	return (
		<CollectionView
			title="Genres"
			subtitle={total ? `${total} genres` : undefined}
			isLoading={isLoading}
			isFetching={isFetching}
			isFetchingNextPage={isFetchingNextPage}
			search={search}
			onSearchChange={setSearch}
			searchPlaceholder="Search genres…"
			searchAriaLabel="Search genres"
			isSearching={isSearching}
			query={query}
			sort={sort}
			onSortChange={setSort}
			sortOptions={SORT_OPTIONS}
			sortAriaLabel="Sort genres"
			hideSortWhileSearching
			view={view}
			onViewChange={setView}
			items={genresList}
			getKey={(g) => g.uuid}
			hasNextPage={hasNextPage}
			fetchNextPage={fetchNextPage}
			gridRowEstimate={GENRE_CARD_ROW_ESTIMATE}
			renderGridItem={(g) => (
				<BookCardShell
					linkProps={{
						to: "/dashboard/genres/$uuid",
						params: { uuid: g.uuid },
						preload: "intent",
					}}
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
					linkProps={{
						to: "/dashboard/genres/$uuid",
						params: { uuid: g.uuid },
					}}
					coverFilename={getCoverFilename(g.cover)}
					coverFallback={<Tag className="size-4 text-muted-foreground/40" />}
					title={g.name}
					subtitle={genreBookCount(g.bookCount)}
					meta={g.bookCount}
				/>
			)}
			emptyState={
				<EmptyState
					title="No genres found"
					description="Genres will appear here once your books are enriched with metadata."
				/>
			}
			searchEmptyState={
				<EmptyState
					title="No matches"
					description={`No genres match “${query}”.`}
				/>
			}
		/>
	);
}
