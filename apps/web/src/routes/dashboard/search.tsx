import { rankTopResults } from "@nanahoshi-v2/api/routers/search/search.ranking";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Clock, User } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { BookCard } from "@/components/books/book-card";
import { createBookCardShellRowHeightEstimator } from "@/components/books/book-card-shell";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import {
	DASHBOARD_LIMIT,
	SectionSkeleton,
} from "@/components/dashboard/home/section-skeleton";
import {
	type SeriesEntry,
	SeriesSection,
} from "@/components/dashboard/home/series-section";
import { TopResultsSection } from "@/components/dashboard/search/top-results-section";
import { CollectionCoverPreview } from "@/components/shared/collection-cover-preview";
import { EmptyState } from "@/components/shared/empty-state";
import { ScrollSection } from "@/components/shared/scroll-section";
import { UserAvatar } from "@/components/shared/user-avatar";
import { VirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { BOOK_TILE_MIN_WIDTH, coverPresets } from "@/utils/covers";
import { client } from "@/utils/orpc";
import { TOP_RESULTS_LIMIT } from "@/utils/top-search";

export const Route = createFileRoute("/dashboard/search")({
	component: SearchPage,
	validateSearch: (search: Record<string, unknown>) => ({
		q: (search.q as string) || "",
	}),
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

const SEARCH_MIN_QUERY_LENGTH = 1;
// In the combined "All" view, books/audiobooks show a capped grid (more
// scannable for goal-directed search) of exactly two rows. The full infinite
// grid lives in each dedicated filter tab, so two infinite lists never stack.
const BOOK_CARD_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();
const AUDIOBOOK_CARD_ROW_ESTIMATE = createBookCardShellRowHeightEstimator({
	square: true,
});

const MEDIA_GRID_GAP = 8;
const GRID_SKELETON_KEYS = Array.from(
	{ length: 24 },
	(_, i) => `grid-skeleton-${i}`,
);

// Explicit column count (vs auto-fill) so the preview can render exactly N rows.
function mediaGridStyle(columns: number) {
	return { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
}
const AUTHOR_SKELETON_KEYS = Array.from(
	{ length: DASHBOARD_LIMIT },
	(_, i) => `author-skeleton-${i}`,
);
const CHIP_SKELETONS = [
	{ id: "chip-all", width: "w-12" },
	{ id: "chip-1", width: "w-16" },
	{ id: "chip-2", width: "w-14" },
	{ id: "chip-3", width: "w-20" },
	{ id: "chip-4", width: "w-16" },
];

function FilterChipsSkeleton() {
	return (
		<div
			className="scrollbar-none -mx-3 flex gap-2 overflow-x-auto px-3 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8"
			aria-busy="true"
		>
			{CHIP_SKELETONS.map(({ id, width }) => (
				<Skeleton key={id} className={cn("h-8 shrink-0 rounded-full", width)} />
			))}
		</div>
	);
}

function ShowAllButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="font-semibold text-muted-foreground text-sm transition-colors hover:text-foreground"
		>
			{m["search.show_all"]()}
		</button>
	);
}

function MediaGridSkeleton({
	title,
	columns,
	square = false,
}: {
	title: string;
	columns: number;
	square?: boolean;
}) {
	return (
		<section className="space-y-3">
			<h2 className="font-semibold text-xl">{title}</h2>
			<div
				className="grid gap-2"
				style={mediaGridStyle(columns)}
				aria-busy="true"
			>
				{GRID_SKELETON_KEYS.slice(0, columns * 2).map((id) => (
					<BookCardSkeleton key={id} square={square} />
				))}
			</div>
		</section>
	);
}

const COLLECTION_SKELETON_KEYS = Array.from(
	{ length: 8 },
	(_, i) => `collection-skeleton-${i}`,
);

function CollectionsGridSkeleton() {
	return (
		<section className="space-y-3" aria-busy="true">
			<h2 className="font-semibold text-xl">{m["search.collections"]()}</h2>
			<div className="grid grid-cols-2 gap-6 sm:grid-cols-3 xl:grid-cols-4">
				{COLLECTION_SKELETON_KEYS.map((key) => (
					<div key={key} className="space-y-2">
						<Skeleton className="aspect-[5/3] w-full rounded-lg" />
						<Skeleton className="h-4 w-2/3 rounded" />
						<Skeleton className="h-3 w-1/3 rounded" />
					</div>
				))}
			</div>
		</section>
	);
}

function AuthorsScrollSkeleton() {
	return (
		<ScrollSection title={m["search.authors"]()}>
			{AUTHOR_SKELETON_KEYS.map((id) => (
				<div
					key={id}
					className="flex w-28 shrink-0 flex-col items-center gap-2 sm:w-32"
				>
					<Skeleton className="size-24 rounded-full sm:size-28" />
					<Skeleton className="h-4 w-20 rounded" />
					<Skeleton className="h-3 w-12 rounded" />
				</div>
			))}
		</ScrollSection>
	);
}

function SearchPage() {
	const { q } = Route.useSearch();
	const normalizedQuery = q.trim();
	const shouldSearch = normalizedQuery.length >= SEARCH_MIN_QUERY_LENGTH;
	const { recent: recentSearches } = useRecentSearches();

	const { data: seriesData, isLoading: isSeriesLoading } = useQuery({
		queryKey: ["series", "search", normalizedQuery],
		queryFn: () => client.series.search({ query: normalizedQuery }),
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const { data: authorsData, isLoading: isAuthorsLoading } = useQuery({
		queryKey: ["authors", "search", normalizedQuery],
		queryFn: () => client.authors.search({ query: normalizedQuery }),
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const { data: usersData, isLoading: isUsersLoading } = useQuery({
		queryKey: ["users", "search", normalizedQuery],
		queryFn: () => client.users.search({ query: normalizedQuery, limit: 10 }),
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const { data: collectionsData, isLoading: isCollectionsLoading } = useQuery({
		queryKey: ["collections", "search", normalizedQuery],
		queryFn: () =>
			client.collections.search({ query: normalizedQuery, limit: 20 }),
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	// Books (ebooks) query
	const {
		data: booksData,
		isLoading: isBooksLoading,
		hasNextPage: booksHasNextPage,
		fetchNextPage: booksFetchNextPage,
		isFetchingNextPage: booksIsFetchingNextPage,
	} = useInfiniteQuery({
		queryKey: ["books", "search", normalizedQuery],
		queryFn: async ({ pageParam }) => {
			return client.books.search({
				query: normalizedQuery || undefined,
				cursor: pageParam ?? undefined,
				limit: 30,
			});
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.pagination.cursor,
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	// Audiobooks query (separate index)
	const {
		data: audiobooksData,
		isLoading: isAudiobooksLoading,
		hasNextPage: audiobooksHasNextPage,
		fetchNextPage: audiobooksFetchNextPage,
		isFetchingNextPage: audiobooksIsFetchingNextPage,
	} = useInfiniteQuery({
		queryKey: ["audiobooks", "search", normalizedQuery],
		queryFn: async ({ pageParam }) => {
			return client.audiobooks.search({
				query: normalizedQuery || undefined,
				cursor: pageParam ?? undefined,
				limit: 30,
			});
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.pagination.cursor,
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const books = useMemo(
		() => booksData?.pages.flatMap((page) => page.books) ?? [],
		[booksData],
	);
	const audiobooks = useMemo(
		() => audiobooksData?.pages.flatMap((page) => page.audiobooks) ?? [],
		[audiobooksData],
	);
	const booksTotalHits = booksData?.pages[0]?.pagination.totalHits;
	const audiobooksTotalHits = audiobooksData?.pages[0]?.pagination.totalHits;
	const series = seriesData ?? [];
	const authors = authorsData ?? [];
	const users = usersData ?? [];
	const collections = collectionsData ?? [];

	// The "All" preview shows exactly two rows; the column count is measured so it
	// adapts to the available width (and the sidebar/viewport).
	const { ref: gridMeasureRef, columns: gridColumns } = useResponsiveColumns({
		minTileWidth: BOOK_TILE_MIN_WIDTH,
		gap: MEDIA_GRID_GAP,
		minColumns: 2,
	});
	const previewCount = gridColumns * 2;

	const booksHasMore =
		(booksTotalHits ?? books.length) > previewCount || booksHasNextPage;
	const audiobooksHasMore =
		(audiobooksTotalHits ?? audiobooks.length) > previewCount ||
		audiobooksHasNextPage;

	const seriesEntries: SeriesEntry[] = useMemo(
		() =>
			series.map((s) => ({
				uuid: s.uuid,
				name: s.name,
				count: s.bookCount,
				cover: s.cover,
				author: s.author,
			})),
		[series],
	);

	// Top results re-rank the section queries above client-side — no extra
	// server round-trip. Books/series/authors gate the skeleton so it never
	// waits on the (separate) audiobook index; slower pools merge in on arrival.
	const topHits = useMemo(
		() =>
			shouldSearch
				? rankTopResults(
						{
							books,
							series: seriesData ?? [],
							authors: authorsData ?? [],
							audiobooks,
							collections: collectionsData ?? [],
							users: usersData ?? [],
						},
						normalizedQuery,
						TOP_RESULTS_LIMIT,
					)
				: [],
		[
			shouldSearch,
			books,
			audiobooks,
			seriesData,
			authorsData,
			collectionsData,
			usersData,
			normalizedQuery,
		],
	);
	const isTopLoading = isBooksLoading || isSeriesLoading || isAuthorsLoading;
	const isAllLoading =
		isTopLoading ||
		isAudiobooksLoading ||
		isUsersLoading ||
		isCollectionsLoading;
	const hasNoResults =
		shouldSearch &&
		!isAllLoading &&
		books.length === 0 &&
		audiobooks.length === 0 &&
		series.length === 0 &&
		authors.length === 0 &&
		users.length === 0 &&
		collections.length === 0;

	const [filter, setFilter] = useState<
		| "all"
		| "books"
		| "audiobooks"
		| "series"
		| "authors"
		| "collections"
		| "users"
	>("all");
	const prevQueryRef = useRef(normalizedQuery);

	if (normalizedQuery !== prevQueryRef.current) {
		prevQueryRef.current = normalizedQuery;
		setFilter("all");
	}

	const showSeries = filter === "all" || filter === "series";
	const showBooks = filter === "all" || filter === "books";
	const showAudiobooks = filter === "all" || filter === "audiobooks";
	const showAuthors = filter === "all" || filter === "authors";
	const showCollections = filter === "all" || filter === "collections";
	const showUsers = filter === "all" || filter === "users";

	const renderBookCard = (book: (typeof books)[number]) => (
		<BookContextMenuTrigger key={book.uuid} bookUuid={book.uuid}>
			<BookCard
				uuid={book.uuid}
				title={book.title ?? null}
				filename={book.filename}
				cover={book.cover ?? null}
				authors={book.authors ?? undefined}
				coverPreset={coverPresets.small}
				contextMenuEnabled={false}
			/>
		</BookContextMenuTrigger>
	);

	const renderAudiobookCard = (audiobook: (typeof audiobooks)[number]) => (
		<BookContextMenuTrigger key={audiobook.uuid} bookUuid={audiobook.uuid}>
			<BookCard
				uuid={audiobook.uuid}
				title={audiobook.title ?? null}
				filename={audiobook.filename}
				cover={audiobook.cover ?? null}
				authors={audiobook.authors ?? undefined}
				coverPreset={coverPresets.small}
				mediaType="audiobook"
				contextMenuEnabled={false}
			/>
		</BookContextMenuTrigger>
	);

	return (
		<div className="px-3 py-6 md:px-6 md:py-6 lg:px-8 lg:py-8">
			{/* Width probe: full-width, so its clientWidth matches the section grids
			    without perturbing the spacing of the content below. */}
			<div ref={gridMeasureRef} className="h-0" aria-hidden="true" />

			<div className="space-y-8">
				{/* Filter chips */}
				{shouldSearch && isAllLoading && <FilterChipsSkeleton />}
				{shouldSearch && !isAllLoading && (
					<div className="scrollbar-none -mx-3 flex gap-2 overflow-x-auto px-3 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
						{(
							[
								{ key: "all", label: m["search.all"](), visible: true },
								{
									key: "series",
									label: m["nav.series"](),
									visible: series.length > 0,
								},
								{
									key: "books",
									label: m["search.books"](),
									visible: books.length > 0,
								},
								{
									key: "audiobooks",
									label: m["search.audiobooks"](),
									visible: audiobooks.length > 0,
								},
								{
									key: "authors",
									label: m["search.authors"](),
									visible: authors.length > 0,
								},
								{
									key: "collections",
									label: m["search.collections"](),
									visible: collections.length > 0,
								},
								{
									key: "users",
									label: m["search.users"](),
									visible: users.length > 0,
								},
							] as const
						)
							.filter((chip) => chip.visible)
							.map(({ key, label }) => (
								<button
									key={key}
									type="button"
									onClick={() => setFilter(key)}
									className={cn(
										"shrink-0 rounded-full px-4 py-1.5 font-medium text-sm transition-colors",
										filter === key
											? "bg-foreground text-background"
											: "bg-muted/70 text-foreground hover:bg-muted",
									)}
								>
									{label}
								</button>
							))}
					</div>
				)}

				{normalizedQuery && !shouldSearch && (
					<p className="text-muted-foreground text-sm">
						{m["search.type_at_least"]({ count: SEARCH_MIN_QUERY_LENGTH })}
					</p>
				)}

				{/* Top results — best cross-type matches, only in the combined view */}
				{shouldSearch && filter === "all" && (
					<TopResultsSection hits={topHits} isLoading={isTopLoading} />
				)}

				{/* Series - Horizontal scroll */}
				{showSeries &&
					(isSeriesLoading ? (
						<SectionSkeleton />
					) : seriesEntries.length > 0 ? (
						<SeriesSection
							title={m["nav.series"]()}
							seriesDetailPath="/dashboard/series/$uuid"
							series={seriesEntries}
							countMessage={m["home.series_book_count"]}
						/>
					) : null)}

				{/* Books */}
				{showBooks &&
					(isBooksLoading ? (
						<MediaGridSkeleton
							title={m["search.books"]()}
							columns={gridColumns}
						/>
					) : books.length > 0 ? (
						<section className="space-y-3">
							<div className="flex items-baseline justify-between gap-3">
								<h2 className="font-semibold text-xl">{m["search.books"]()}</h2>
								{filter === "all" && booksHasMore && (
									<ShowAllButton onClick={() => setFilter("books")} />
								)}
							</div>
							<BookContextMenuRoot>
								{filter === "books" ? (
									<VirtualizedCardGrid
										items={books}
										getKey={(book) => book.uuid}
										gap={8}
										estimateRowHeight={BOOK_CARD_ROW_ESTIMATE}
										hasNextPage={booksHasNextPage}
										isFetchingNextPage={booksIsFetchingNextPage}
										fetchNextPage={booksFetchNextPage}
										renderItem={(book) => renderBookCard(book)}
									/>
								) : (
									<div
										className="grid gap-2"
										style={mediaGridStyle(gridColumns)}
									>
										{books
											.slice(0, previewCount)
											.map((book) => renderBookCard(book))}
									</div>
								)}
							</BookContextMenuRoot>
						</section>
					) : null)}

				{/* Audiobooks */}
				{showAudiobooks &&
					(isAudiobooksLoading ? (
						<MediaGridSkeleton
							title={m["search.audiobooks"]()}
							columns={gridColumns}
							square
						/>
					) : audiobooks.length > 0 ? (
						<section className="space-y-3">
							<div className="flex items-baseline justify-between gap-3">
								<h2 className="font-semibold text-xl">
									{m["search.audiobooks"]()}
								</h2>
								{filter === "all" && audiobooksHasMore && (
									<ShowAllButton onClick={() => setFilter("audiobooks")} />
								)}
							</div>
							<BookContextMenuRoot mediaType="audiobook">
								{filter === "audiobooks" ? (
									<VirtualizedCardGrid
										items={audiobooks}
										getKey={(audiobook) => audiobook.uuid}
										gap={8}
										estimateRowHeight={AUDIOBOOK_CARD_ROW_ESTIMATE}
										hasNextPage={audiobooksHasNextPage}
										isFetchingNextPage={audiobooksIsFetchingNextPage}
										fetchNextPage={audiobooksFetchNextPage}
										renderItem={(audiobook) => renderAudiobookCard(audiobook)}
									/>
								) : (
									<div
										className="grid gap-2"
										style={mediaGridStyle(gridColumns)}
									>
										{audiobooks
											.slice(0, previewCount)
											.map((audiobook) => renderAudiobookCard(audiobook))}
									</div>
								)}
							</BookContextMenuRoot>
						</section>
					) : null)}

				{/* Authors LAST - Horizontal scroll with circular avatars */}
				{showAuthors &&
					(isAuthorsLoading ? (
						<AuthorsScrollSkeleton />
					) : authors.length > 0 ? (
						<ScrollSection title={m["search.authors"]()}>
							{authors.map((a) => (
								<Link
									key={a.uuid}
									to="/dashboard/authors/$uuid"
									params={{ uuid: a.uuid }}
									className="group flex w-28 shrink-0 flex-col items-center gap-2 sm:w-32"
								>
									<div className="flex size-24 items-center justify-center rounded-full bg-muted/70 ring-1 ring-white/[0.05] transition-shadow duration-200 group-hover:ring-2 group-hover:ring-primary/30 sm:size-28">
										<User className="size-11 text-muted-foreground/50 sm:size-12" />
									</div>
									<div className="text-center">
										<p className="line-clamp-2 font-medium text-sm leading-tight">
											{a.name}
										</p>
										<p className="text-muted-foreground text-xs">
											{m["media.book_count"]({ count: a.bookCount })}
										</p>
									</div>
								</Link>
							))}
						</ScrollSection>
					) : null)}

				{/* Collections */}
				{showCollections &&
					(isCollectionsLoading ? (
						<CollectionsGridSkeleton />
					) : collections.length > 0 ? (
						<section className="space-y-3">
							<h2 className="font-semibold text-xl">
								{m["search.collections"]()}
							</h2>
							<div className="grid grid-cols-2 gap-6 sm:grid-cols-3 xl:grid-cols-4">
								{collections.map((collection) => (
									<Link
										key={collection.id}
										to="/dashboard/collections/$collectionId"
										params={{ collectionId: collection.id }}
										preload="intent"
										className="group block"
									>
										<div className="overflow-hidden rounded-lg">
											<CollectionCoverPreview
												covers={collection.previewCovers}
											/>
										</div>
										<p className="truncate pt-2 font-semibold text-sm">
											{collection.name}
										</p>
										<p className="truncate text-muted-foreground text-xs">
											{m["search.collection_by"]({
												username: collection.ownerUsername,
											})}
										</p>
									</Link>
								))}
							</div>
						</section>
					) : null)}

				{/* Users - Horizontal scroll with circular avatars */}
				{showUsers &&
					(isUsersLoading ? (
						<AuthorsScrollSkeleton />
					) : users.length > 0 ? (
						<ScrollSection title={m["search.users"]()}>
							{users.map((u) => (
								<Link
									key={u.username}
									to="/dashboard/user/$username"
									params={{ username: u.username }}
									className="group flex w-28 shrink-0 flex-col items-center gap-2 sm:w-32"
								>
									<UserAvatar
										name={u.displayUsername ?? u.name}
										image={u.image}
										className="size-24 sm:size-28"
									/>
									<div className="text-center">
										<p className="line-clamp-2 font-medium text-sm leading-tight">
											{u.displayUsername ?? u.name}
										</p>
										<p className="text-muted-foreground text-xs">
											@{u.username}
										</p>
									</div>
								</Link>
							))}
						</ScrollSection>
					) : null)}

				{hasNoResults && (
					<EmptyState
						title={m["search.no_results_title"]({ query: normalizedQuery })}
						description={m["search.no_results_desc"]()}
					/>
				)}

				{!normalizedQuery &&
					(recentSearches.length > 0 ? (
						<section className="space-y-3">
							<h2 className="font-semibold text-xl">
								{m["search.recent_searches"]()}
							</h2>
							<div className="flex flex-wrap gap-2">
								{recentSearches.map((term) => (
									<Link
										key={term}
										to="/dashboard/search"
										search={{ q: term }}
										className="inline-flex items-center gap-2 rounded-full bg-muted/70 px-4 py-1.5 font-medium text-foreground text-sm transition-colors hover:bg-muted"
									>
										<Clock className="size-3.5 text-muted-foreground/70" />
										{term}
									</Link>
								))}
							</div>
						</section>
					) : (
						<EmptyState description={m["search.empty_prompt"]()} />
					))}
			</div>
		</div>
	);
}
