import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Headphones } from "lucide-react";
import { useMemo, useState } from "react";
import { BookCardShell } from "@/components/books/book-card-shell";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { SeriesContextMenu } from "@/components/series/series-context-menu";
import { CollectionSearch } from "@/components/shared/collection-search";
import { CollectionToolbar } from "@/components/shared/collection-toolbar";
import { EmptyState } from "@/components/shared/empty-state";
import { MediaListRow } from "@/components/shared/media-list-row";
import { type SortOption, SortSelect } from "@/components/shared/sort-select";
import { type ViewMode, ViewToggle } from "@/components/shared/view-toggle";
import { VirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
import { useDebounce } from "@/hooks/use-debounce";
import {
	BOOK_GRID_CLASS,
	coverPresets,
	getCoverFilename,
} from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;
const SKELETON_KEYS = Array.from(
	{ length: 12 },
	(_, i) => `ab-series-skeleton-${i}`,
);

type SortMode = "name" | "books" | "recent";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "name", label: "Title" },
	{ value: "books", label: "Most audiobooks" },
	{ value: "recent", label: "Recently added" },
];

const audiobookCount = (count: number) =>
	`${count} ${count === 1 ? "audiobook" : "audiobooks"}`;

const VIEW_STORAGE_KEY = "nh-ab-series-view";

function readStoredView(): ViewMode {
	if (typeof window === "undefined") return "grid";
	const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
	return stored === "list" ? "list" : "grid";
}

export const Route = createFileRoute("/dashboard/audiobooks/series/")({
	component: AudiobookSeriesPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function AudiobookSeriesPage() {
	const [view, setView] = useState<ViewMode>(readStoredView);
	const [sort, setSort] = useState<SortMode>("name");
	const [search, setSearch] = useState("");
	const query = useDebounce(search.trim(), 300);
	const isSearching = query.length > 0;

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

	const handleViewChange = (next: ViewMode) => {
		setView(next);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(VIEW_STORAGE_KEY, next);
		}
	};

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<CollectionToolbar
				title="Audiobook Series"
				loading={isFetching && !isLoading && !isFetchingNextPage}
				subtitle={
					!isLoading && !isSearching && seriesList.length > 0 && total
						? `${total} series`
						: undefined
				}
				actions={
					!isLoading && (seriesList.length > 0 || isSearching) ? (
						<>
							<CollectionSearch
								value={search}
								onChange={setSearch}
								placeholder="Search series…"
								ariaLabel="Search audiobook series"
							/>
							{seriesList.length > 0 && (
								<ViewToggle view={view} onChange={handleViewChange} />
							)}
							{!isSearching && seriesList.length > 0 && (
								<SortSelect
									value={sort}
									onChange={setSort}
									options={SORT_OPTIONS}
									ariaLabel="Sort series"
								/>
							)}
						</>
					) : undefined
				}
			/>

			{isLoading && (
				<div className={BOOK_GRID_CLASS}>
					{SKELETON_KEYS.map((key) => (
						<BookCardSkeleton key={key} />
					))}
				</div>
			)}

			{!isLoading && seriesList.length === 0 && (
				<EmptyState
					title={isSearching ? "No matches" : "No audiobook series found"}
					description={
						isSearching
							? `No series match “${query}”.`
							: "Series will appear here once your audiobooks are enriched with metadata."
					}
				/>
			)}

			{seriesList.length > 0 &&
				(view === "grid" ? (
					<VirtualizedCardGrid
						key="grid"
						items={seriesList}
						getKey={(s) => s.id}
						gap={8}
						estimateRowHeight={320}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						fetchNextPage={fetchNextPage}
						renderItem={(s) => (
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
					/>
				) : (
					<VirtualizedCardGrid
						key="list"
						items={seriesList}
						getKey={(s) => s.id}
						gap={0}
						columns={1}
						estimateRowHeight={80}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						fetchNextPage={fetchNextPage}
						renderItem={(s) => (
							<SeriesContextMenu
								href={`/dashboard/audiobooks/series/${encodeURIComponent(s.name)}`}
							>
								<MediaListRow
									linkProps={{
										to: "/dashboard/audiobooks/series/$seriesName",
										params: { seriesName: s.name },
										preload: "intent",
									}}
									coverFilename={getCoverFilename(s.cover)}
									fallback={
										<Headphones className="size-5 text-muted-foreground/40" />
									}
									title={s.name}
									subtitle={audiobookCount(s.audiobookCount)}
								/>
							</SeriesContextMenu>
						)}
					/>
				))}
		</div>
	);
}
