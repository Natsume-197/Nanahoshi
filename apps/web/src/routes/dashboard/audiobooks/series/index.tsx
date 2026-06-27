import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Headphones } from "lucide-react";
import { useMemo } from "react";
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
const AUDIOBOOK_SERIES_CARD_ROW_ESTIMATE =
	createBookCardShellRowHeightEstimator({ square: true });

type SortMode = "name" | "books" | "recent";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "name", label: "Title" },
	{ value: "books", label: "Most audiobooks" },
	{ value: "recent", label: "Recently added" },
];

const audiobookCount = (count: number) =>
	`${count} ${count === 1 ? "audiobook" : "audiobooks"}`;

export const Route = createFileRoute("/dashboard/audiobooks/series/")({
	component: AudiobookSeriesPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function AudiobookSeriesPage() {
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
		storageKey: "nh-ab-series-view",
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
		orpc.audiobooks.listSeries.infiniteOptions({
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
		...orpc.audiobooks.countSeries.queryOptions(),
		staleTime: 30_000,
	});

	const seriesList = useMemo(() => data?.pages.flat() ?? [], [data]);

	return (
		<CollectionView
			title="Audiobook Series"
			subtitle={total ? `${total} series` : undefined}
			isLoading={isLoading}
			isFetching={isFetching}
			isFetchingNextPage={isFetchingNextPage}
			search={search}
			onSearchChange={setSearch}
			searchPlaceholder="Search series…"
			searchAriaLabel="Search audiobook series"
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
			gridRowEstimate={AUDIOBOOK_SERIES_CARD_ROW_ESTIMATE}
			renderGridItem={(s) => (
				<SeriesContextMenu
					href={`/dashboard/audiobooks/series/${encodeURIComponent(s.name)}`}
				>
					<div>
						<BookCardShell
							linkProps={{
								to: "/dashboard/audiobooks/series/$seriesName",
								params: { seriesName: s.name },
								preload: "intent",
							}}
							ariaLabel={s.name}
							coverFilename={getCoverFilename(s.cover) ?? undefined}
							coverPreset={coverPresets.small}
							square
							fallback={
								<div className="flex h-full w-full items-center justify-center">
									<Headphones className="size-8 text-muted-foreground/40" />
								</div>
							}
							title={s.name}
							subtitle={audiobookCount(s.audiobookCount)}
						/>
					</div>
				</SeriesContextMenu>
			)}
			listHeader={
				<CollectionTableHeader withAuthor={false} metaLabel="Audiobooks" />
			}
			renderListItem={(s, index) => (
				<SeriesContextMenu
					href={`/dashboard/audiobooks/series/${encodeURIComponent(s.name)}`}
				>
					<CollectionTableRow
						withAuthor={false}
						index={index + 1}
						linkProps={{
							to: "/dashboard/audiobooks/series/$seriesName",
							params: { seriesName: s.name },
						}}
						coverFilename={getCoverFilename(s.cover)}
						coverFallback={
							<Headphones className="size-4 text-muted-foreground/40" />
						}
						title={s.name}
						subtitle={audiobookCount(s.audiobookCount)}
						meta={s.audiobookCount}
					/>
				</SeriesContextMenu>
			)}
			emptyState={
				<EmptyState
					title="No audiobook series found"
					description="Series will appear here once your audiobooks are enriched with metadata."
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
