import { Books, Headphones } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { AuthorLinkList } from "@/components/books/author-link-list";
import {
	BookCardShell,
	createBookCardShellRowHeightEstimator,
} from "@/components/books/book-card-shell";
import { QueryErrorState } from "@/components/libraries/query-error-state";
import { SeriesContextMenu } from "@/components/series/series-context-menu";
import { CollectionSearch } from "@/components/shared/collection-search";
import { CollectionView } from "@/components/shared/collection-view";
import { EmptyState } from "@/components/shared/empty-state";
import {
	FilterBar,
	FilterField,
	type FilterOption,
	FilterSelect,
} from "@/components/shared/filter-bar";
import type { SortOption } from "@/components/shared/sort-select";
import { useCollectionView } from "@/hooks/use-collection-view";
import { useUiSnapshotState } from "@/hooks/use-ui-snapshot-state";
import { coverPresets, getCoverFilename } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;
const BOOK_SERIES_ROW_ESTIMATE = createBookCardShellRowHeightEstimator({
	subtitleLines: 2,
});
const AUDIOBOOK_SERIES_ROW_ESTIMATE = createBookCardShellRowHeightEstimator({
	square: true,
});

type SortMode = "name" | "books" | "recent";
type SeriesFormat = "books" | "audiobooks" | "read-listen";

/** Series views mapped onto the shape the page renders. */
type SeriesItem = {
	uuid: string;
	name: string;
	cover: string | null;
	count: number;
	pairedCount?: number;
	author?: { id: number; name: string } | null;
};

const seriesCount = (count: number, isAudiobook: boolean) =>
	`${count} ${
		isAudiobook
			? count === 1
				? "audiobook"
				: "audiobooks"
			: count === 1
				? "book"
				: "books"
	}`;

export const Route = createFileRoute("/dashboard/series/")({
	component: SeriesPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function SeriesPage() {
	// Format is a local view facet (no URL param). Router state seeds a fresh
	// visit from "Show all"; the history snapshot wins when navigating back.
	const location = useLocation();
	const requestedFormat = (location.state as { format?: SeriesFormat }).format;
	const defaultFormat: SeriesFormat =
		requestedFormat === "audiobooks" || requestedFormat === "read-listen"
			? requestedFormat
			: "books";
	const [format, setFormat] = useUiSnapshotState<SeriesFormat>(
		"series-format",
		defaultFormat,
	);
	const isAudiobook = format === "audiobooks";
	const isReadListen = format === "read-listen";

	// Both counts drive the subtitle and which format chips are offered.
	const { data: bookSeriesCount } = useQuery({
		...orpc.series.count.queryOptions(),
		staleTime: 30_000,
	});
	const { data: audiobookSeriesCount } = useQuery({
		...orpc.audiobooks.countSeries.queryOptions(),
		staleTime: 30_000,
	});
	const hasBooks = (bookSeriesCount ?? 0) > 0;
	const hasAudiobooks = (audiobookSeriesCount ?? 0) > 0;

	// If the selected format has no series but the other does, switch to it.
	// Render-phase adjustment (no useEffect): guarded by the format check so it
	// runs at most once per count change.
	if (
		isAudiobook &&
		audiobookSeriesCount !== undefined &&
		!hasAudiobooks &&
		hasBooks
	) {
		setFormat("books");
	} else if (
		format === "books" &&
		bookSeriesCount !== undefined &&
		!hasBooks &&
		hasAudiobooks
	) {
		setFormat("audiobooks");
	}

	const formatOptions = useMemo<FilterOption[]>(() => {
		const opts: FilterOption[] = [];
		if (hasBooks || format === "books")
			opts.push({ value: "books", label: "Books" });
		if (hasAudiobooks || format === "audiobooks")
			opts.push({ value: "audiobooks", label: "Audiobooks" });
		opts.push({ value: "read-listen", label: "Read & Listen" });
		// Keep Read & Listen available even when no pairs have been confirmed.
		return hasBooks || hasAudiobooks
			? opts
			: [
					{ value: "books", label: "Books" },
					{ value: "audiobooks", label: "Audiobooks" },
					{ value: "read-listen", label: "Read & Listen" },
				];
	}, [hasBooks, hasAudiobooks, format]);

	const { sort, setSort, search, setSearch, query, isSearching } =
		useCollectionView<SortMode>({
			storageKey: "nh-series-view",
			defaultSort: "name",
		});

	const sortOptions: readonly SortOption<SortMode>[] = [
		{ value: "name", label: "Title" },
		{ value: "books", label: isAudiobook ? "Most audiobooks" : "Most books" },
		{ value: "recent", label: "Recently added" },
	];

	// Only the active format fetches its paginated listing.
	const bookInput = (pageParam: number) => ({
		limit: PAGE_SIZE,
		cursor: pageParam,
		sort,
		query: query || undefined,
	});
	const getNextPage = (
		lastPage: unknown[],
		_allPages: unknown,
		lastPageParam: number,
	) => (lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined);

	const booksQuery = useInfiniteQuery({
		...orpc.series.list.infiniteOptions({
			input: bookInput,
			getNextPageParam: getNextPage,
			initialPageParam: 0,
			staleTime: 30_000,
		}),
		enabled: format === "books",
	});
	const audiobooksQuery = useInfiniteQuery({
		...orpc.audiobooks.listSeries.infiniteOptions({
			input: bookInput,
			getNextPageParam: getNextPage,
			initialPageParam: 0,
			staleTime: 30_000,
		}),
		enabled: isAudiobook,
	});

	const readListenQuery = useInfiniteQuery({
		...orpc.series.listReadListen.infiniteOptions({
			input: bookInput,
			initialPageParam: 0,
			getNextPageParam: (page, _pages, offset) =>
				offset + page.items.length < page.total
					? offset + PAGE_SIZE
					: undefined,
			staleTime: 30_000,
		}),
		enabled: isReadListen,
	});

	const {
		data,
		isLoading,
		isError,
		refetch,
		isFetching,
		hasNextPage,
		fetchNextPage,
		isFetchingNextPage,
	} = isReadListen
		? readListenQuery
		: isAudiobook
			? audiobooksQuery
			: booksQuery;

	const total = isReadListen
		? readListenQuery.data?.pages[0]?.total
		: isAudiobook
			? audiobookSeriesCount
			: bookSeriesCount;

	const seriesList = useMemo<SeriesItem[]>(() => {
		const rows = (
			isReadListen
				? (readListenQuery.data?.pages.flatMap((page) => page.items) ?? [])
				: (data?.pages.flat() ?? [])
		) as Array<{
			uuid: string;
			name: string;
			cover: string | null;
			bookCount?: number;
			pairedCount?: number;
			audiobookCount?: number;
			author?: { id: number; name: string } | null;
		}>;
		return rows.map((s) => ({
			uuid: s.uuid,
			name: s.name,
			cover: s.cover,
			pairedCount: s.pairedCount,
			count: s.audiobookCount ?? s.bookCount ?? 0,
			author: s.author ?? null,
		}));
	}, [data, isReadListen, readListenQuery.data]);

	const detailPath = isAudiobook
		? ("/dashboard/audiobooks/series/$uuid" as const)
		: ("/dashboard/series/$uuid" as const);

	const renderSubtitle = (s: SeriesItem) => (
		<>
			<span className="line-clamp-1 block">
				{isReadListen
					? `${s.pairedCount ?? 0} of ${s.count} volumes paired`
					: seriesCount(s.count, isAudiobook)}
			</span>
			{s.author ? (
				<span className="pointer-events-auto line-clamp-1 block w-fit max-w-full">
					<AuthorLinkList
						authors={[s.author]}
						linkClassName="transition-colors hover:text-foreground"
					/>
				</span>
			) : null}
		</>
	);

	const filterBar = (
		<FilterBar>
			<FilterField label="Search" className="col-span-full lg:col-span-2">
				<CollectionSearch
					value={search}
					onChange={setSearch}
					placeholder="Search series…"
					ariaLabel="Search series"
					className="sm:w-full"
				/>
			</FilterField>
			{formatOptions.length > 1 ? (
				<FilterField label="Format">
					<FilterSelect
						value={format}
						onChange={(v) => setFormat(v as SeriesFormat)}
						options={formatOptions}
						ariaLabel="Filter series by format"
					/>
				</FilterField>
			) : null}
			<FilterField label="Sort">
				<FilterSelect
					value={sort}
					onChange={(v) => setSort(v as SortMode)}
					options={sortOptions}
					ariaLabel="Sort series"
				/>
			</FilterField>
		</FilterBar>
	);

	return (
		<CollectionView
			title="Series"
			subtitle={total ? `${total} series` : undefined}
			isLoading={isLoading}
			isError={isError}
			errorState={<QueryErrorState onRetry={() => void refetch()} />}
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
			sortOptions={sortOptions}
			sortAriaLabel="Sort series"
			filterBar={filterBar}
			items={seriesList}
			getKey={(s) => s.uuid}
			hasNextPage={hasNextPage}
			fetchNextPage={fetchNextPage}
			gridRowEstimate={
				isAudiobook ? AUDIOBOOK_SERIES_ROW_ESTIMATE : BOOK_SERIES_ROW_ESTIMATE
			}
			renderGridItem={(s) => (
				<SeriesContextMenu
					href={`${detailPath.replace("$uuid", s.uuid)}${isReadListen ? "?readListen=true" : ""}`}
				>
					<div>
						<BookCardShell
							linkProps={{
								to: detailPath,
								params: { uuid: s.uuid },
								search: isReadListen ? { readListen: true } : {},
								preload: "intent",
							}}
							ariaLabel={s.name}
							coverFilename={getCoverFilename(s.cover) ?? undefined}
							coverPreset={coverPresets.small}
							square={isAudiobook}
							fallback={
								<div className="flex h-full w-full items-center justify-center">
									{isAudiobook ? (
										<Headphones className="size-8 text-muted-foreground/40" />
									) : (
										<Books className="size-8 text-muted-foreground/40" />
									)}
								</div>
							}
							title={s.name}
							subtitle={renderSubtitle(s)}
							subtitleLines={isAudiobook ? 1 : 2}
						/>
					</div>
				</SeriesContextMenu>
			)}
			emptyState={
				<EmptyState
					title="No series found"
					description={
						isReadListen
							? "Series will appear here when a volume has a confirmed ebook and audiobook pair."
							: isAudiobook
								? "Series will appear here once your audiobooks are enriched with metadata."
								: "Series will appear here once your books are enriched with metadata."
					}
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
