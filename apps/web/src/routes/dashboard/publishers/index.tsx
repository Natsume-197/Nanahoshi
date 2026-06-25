import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
	BookCardShell,
	createBookCardShellRowHeightEstimator,
} from "@/components/books/book-card-shell";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
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
	(_, i) => `publisher-skeleton-${i}`,
);
const PUBLISHER_CARD_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

type SortMode = "name" | "books" | "recent";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "name", label: "Name" },
	{ value: "books", label: "Most books" },
	{ value: "recent", label: "Recently added" },
];

const publisherBookCount = (count: number) =>
	`${count} ${count === 1 ? "book" : "books"}`;

const VIEW_STORAGE_KEY = "nh-publishers-view";

function readStoredView(): ViewMode {
	if (typeof window === "undefined") return "grid";
	const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
	return stored === "list" ? "list" : "grid";
}

export const Route = createFileRoute("/dashboard/publishers/")({
	component: PublishersPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function PublishersPage() {
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
		orpc.publishers.list.infiniteOptions({
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
		...orpc.publishers.count.queryOptions(),
		staleTime: 30_000,
	});

	const publishersList = useMemo(() => data?.pages.flat() ?? [], [data]);

	const handleViewChange = (next: ViewMode) => {
		setView(next);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(VIEW_STORAGE_KEY, next);
		}
	};

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<CollectionToolbar
				title="Publishers"
				loading={isFetching && !isLoading && !isFetchingNextPage}
				subtitle={
					!isLoading && !isSearching && publishersList.length > 0 && total
						? `${total} publishers`
						: undefined
				}
				actions={
					!isLoading && (publishersList.length > 0 || isSearching) ? (
						<>
							<CollectionSearch
								value={search}
								onChange={setSearch}
								placeholder="Search publishers…"
								ariaLabel="Search publishers"
							/>
							{publishersList.length > 0 && (
								<ViewToggle view={view} onChange={handleViewChange} />
							)}
							{!isSearching && publishersList.length > 0 && (
								<SortSelect
									value={sort}
									onChange={setSort}
									options={SORT_OPTIONS}
									ariaLabel="Sort publishers"
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

			{!isLoading && publishersList.length === 0 && (
				<EmptyState
					title={isSearching ? "No matches" : "No publishers found"}
					description={
						isSearching
							? `No publishers match “${query}”.`
							: "Publishers will appear here once your books are enriched with metadata."
					}
				/>
			)}

			{publishersList.length > 0 &&
				(view === "grid" ? (
					<VirtualizedCardGrid
						key="grid"
						items={publishersList}
						getKey={(p) => p.id}
						gap={8}
						estimateRowHeight={PUBLISHER_CARD_ROW_ESTIMATE}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						fetchNextPage={fetchNextPage}
						renderItem={(p) => (
							<BookCardShell
								linkProps={{
									to: "/dashboard/publishers/$publisherName",
									params: { publisherName: p.name },
									preload: "intent",
								}}
								ariaLabel={p.name}
								coverFilename={getCoverFilename(p.cover) ?? undefined}
								coverPreset={coverPresets.small}
								fallback={
									<div className="flex h-full w-full items-center justify-center">
										<Building2 className="size-8 text-muted-foreground/40" />
									</div>
								}
								title={p.name}
								subtitle={publisherBookCount(p.bookCount)}
							/>
						)}
					/>
				) : (
					<VirtualizedCardGrid
						key="list"
						items={publishersList}
						getKey={(p) => p.id}
						gap={0}
						columns={1}
						estimateRowHeight={80}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						fetchNextPage={fetchNextPage}
						renderItem={(p) => (
							<MediaListRow
								linkProps={{
									to: "/dashboard/publishers/$publisherName",
									params: { publisherName: p.name },
									preload: "intent",
								}}
								coverFilename={getCoverFilename(p.cover)}
								fallback={
									<Building2 className="size-5 text-muted-foreground/40" />
								}
								title={p.name}
								subtitle={publisherBookCount(p.bookCount)}
							/>
						)}
					/>
				))}
		</div>
	);
}
