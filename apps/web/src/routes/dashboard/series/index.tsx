import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { useMemo } from "react";
import { AuthorLinkList } from "@/components/books/author-link-list";
import {
	BookCardShell,
	createBookCardShellRowHeightEstimator,
} from "@/components/books/book-card-shell";
import { SeriesContextMenu } from "@/components/series/series-context-menu";
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
const SERIES_CARD_ROW_ESTIMATE = createBookCardShellRowHeightEstimator({
	subtitleLines: 2,
});

type SortMode = "name" | "books" | "recent";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "name", label: "Title" },
	{ value: "books", label: "Most books" },
	{ value: "recent", label: "Recently added" },
];

const seriesBookCount = (count: number) =>
	`${count} ${count === 1 ? "book" : "books"}`;

const renderSeriesSubtitle = (series: {
	author?: { id: number; name: string } | null;
	bookCount: number;
}) => (
	<>
		<span className="line-clamp-1 block">
			{seriesBookCount(series.bookCount)}
		</span>
		{series.author ? (
			<span className="pointer-events-auto line-clamp-1 block w-fit max-w-full">
				<AuthorLinkList
					authors={[series.author]}
					linkClassName="transition-colors hover:text-foreground"
				/>
			</span>
		) : null}
	</>
);

export const Route = createFileRoute("/dashboard/series/")({
	component: SeriesPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function SeriesPage() {
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
		storageKey: "nh-series-view",
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
		orpc.series.list.infiniteOptions({
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
		...orpc.series.count.queryOptions(),
		staleTime: 30_000,
	});

	const seriesList = useMemo(() => data?.pages.flat() ?? [], [data]);

	return (
		<CollectionView
			title="Book Series"
			subtitle={total ? `${total} series` : undefined}
			isLoading={isLoading}
			isFetching={isFetching}
			isFetchingNextPage={isFetchingNextPage}
			search={search}
			onSearchChange={setSearch}
			searchPlaceholder="Search series…"
			searchAriaLabel="Search series"
			isSearching={isSearching}
			query={query}
			sort={sort}
			onSortChange={setSort}
			sortOptions={SORT_OPTIONS}
			sortAriaLabel="Sort series"
			hideSortWhileSearching
			view={view}
			onViewChange={setView}
			items={seriesList}
			getKey={(s) => s.id}
			hasNextPage={hasNextPage}
			fetchNextPage={fetchNextPage}
			gridRowEstimate={SERIES_CARD_ROW_ESTIMATE}
			renderGridItem={(s) => (
				<SeriesContextMenu
					href={`/dashboard/series/${encodeURIComponent(s.name)}`}
				>
					<div>
						<BookCardShell
							linkProps={{
								to: "/dashboard/series/$seriesName",
								params: { seriesName: s.name },
								preload: "intent",
							}}
							ariaLabel={s.name}
							coverFilename={getCoverFilename(s.cover) ?? undefined}
							coverPreset={coverPresets.small}
							fallback={
								<div className="flex h-full w-full items-center justify-center">
									<Library className="size-8 text-muted-foreground/40" />
								</div>
							}
							title={s.name}
							subtitle={renderSeriesSubtitle(s)}
							subtitleLines={2}
						/>
					</div>
				</SeriesContextMenu>
			)}
			listHeader={<CollectionTableHeader metaLabel="Books" />}
			renderListItem={(s, index) => (
				<SeriesContextMenu
					href={`/dashboard/series/${encodeURIComponent(s.name)}`}
				>
					<CollectionTableRow
						index={index + 1}
						linkProps={{
							to: "/dashboard/series/$seriesName",
							params: { seriesName: s.name },
						}}
						coverFilename={getCoverFilename(s.cover)}
						coverFallback={
							<Library className="size-4 text-muted-foreground/40" />
						}
						title={s.name}
						subtitle={seriesBookCount(s.bookCount)}
						authors={s.author ? [s.author] : undefined}
						meta={s.bookCount}
					/>
				</SeriesContextMenu>
			)}
			emptyState={
				<EmptyState
					title="No series found"
					description="Series will appear here once your books are enriched with metadata."
				/>
			}
			searchEmptyState={
				<EmptyState
					title="No matches"
					description={`No series match “${query}”.`}
				/>
			}
		/>
	);
}
