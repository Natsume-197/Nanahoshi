import { Books, Headphones } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AuthorLinkList } from "@/components/books/author-link-list";
import {
	BookCardShell,
	createBookCardShellRowHeightEstimator,
} from "@/components/books/book-card-shell";
import { SeriesContextMenu } from "@/components/series/series-context-menu";
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
type SeriesFormat = "books" | "audiobooks";

const FORMAT_OPTIONS: readonly FilterOption[] = [
	{ value: "books", label: "Books" },
	{ value: "audiobooks", label: "Audiobooks" },
];

/** Both formats mapped onto the shape the page renders. */
type SeriesItem = {
	uuid: string;
	name: string;
	cover: string | null;
	count: number;
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
	// Format is a local view facet (no URL param). Seeded from router history
	// state so "Show all" on the home's audiobook-series row lands on audiobooks.
	const location = useLocation();
	const [format, setFormat] = useState<SeriesFormat>(() =>
		(location.state as { format?: SeriesFormat }).format === "audiobooks"
			? "audiobooks"
			: "books",
	);
	const isAudiobook = format === "audiobooks";

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

	const sortOptions: readonly SortOption<SortMode>[] = [
		{ value: "name", label: "Title" },
		{ value: "books", label: isAudiobook ? "Most audiobooks" : "Most books" },
		{ value: "recent", label: "Recently added" },
	];

	// Two separate queries (only the active format fetches) rather than one union
	// of two differently-typed option objects, which TanStack can't type-check.
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
		enabled: !isAudiobook,
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

	const {
		data,
		isLoading,
		isFetching,
		hasNextPage,
		fetchNextPage,
		isFetchingNextPage,
	} = isAudiobook ? audiobooksQuery : booksQuery;

	const countOptions = isAudiobook
		? orpc.audiobooks.countSeries.queryOptions()
		: orpc.series.count.queryOptions();
	const { data: total } = useQuery({ ...countOptions, staleTime: 30_000 });

	const seriesList = useMemo<SeriesItem[]>(() => {
		const rows = (data?.pages.flat() ?? []) as Array<{
			uuid: string;
			name: string;
			cover: string | null;
			bookCount?: number;
			audiobookCount?: number;
			author?: { id: number; name: string } | null;
		}>;
		return rows.map((s) => ({
			uuid: s.uuid,
			name: s.name,
			cover: s.cover,
			count: s.audiobookCount ?? s.bookCount ?? 0,
			author: s.author ?? null,
		}));
	}, [data]);

	const detailPath = isAudiobook
		? ("/dashboard/audiobooks/series/$uuid" as const)
		: ("/dashboard/series/$uuid" as const);

	const renderSubtitle = (s: SeriesItem) => (
		<>
			<span className="line-clamp-1 block">
				{seriesCount(s.count, isAudiobook)}
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
			<FilterField label="Format">
				<FilterSelect
					value={format}
					onChange={(v) => setFormat(v as SeriesFormat)}
					options={FORMAT_OPTIONS}
					ariaLabel="Filter series by format"
				/>
			</FilterField>
			<FilterField label="Sort">
				<FilterSelect
					value={sort}
					onChange={(v) => setSort(v as SortMode)}
					options={sortOptions}
					ariaLabel="Sort series"
				/>
			</FilterField>
			<FilterField label="View">
				<ViewToggle view={view} onChange={setView} fullWidth />
			</FilterField>
		</FilterBar>
	);

	return (
		<CollectionView
			title="Series"
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
			sortOptions={sortOptions}
			sortAriaLabel="Sort series"
			filterBar={filterBar}
			view={view}
			onViewChange={setView}
			items={seriesList}
			getKey={(s) => s.uuid}
			hasNextPage={hasNextPage}
			fetchNextPage={fetchNextPage}
			gridRowEstimate={
				isAudiobook ? AUDIOBOOK_SERIES_ROW_ESTIMATE : BOOK_SERIES_ROW_ESTIMATE
			}
			renderGridItem={(s) => (
				<SeriesContextMenu href={detailPath.replace("$uuid", s.uuid)}>
					<div>
						<BookCardShell
							linkProps={{
								to: detailPath,
								params: { uuid: s.uuid },
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
			listHeader={
				<CollectionTableHeader
					withAuthor={!isAudiobook}
					metaLabel={isAudiobook ? "Audiobooks" : "Books"}
				/>
			}
			renderListItem={(s, index) => (
				<SeriesContextMenu href={detailPath.replace("$uuid", s.uuid)}>
					<CollectionTableRow
						withAuthor={!isAudiobook}
						index={index + 1}
						linkProps={{
							to: detailPath,
							params: { uuid: s.uuid },
						}}
						coverFilename={getCoverFilename(s.cover)}
						coverFallback={
							isAudiobook ? (
								<Headphones className="size-4 text-muted-foreground/40" />
							) : (
								<Books className="size-4 text-muted-foreground/40" />
							)
						}
						title={s.name}
						subtitle={seriesCount(s.count, isAudiobook)}
						authors={s.author ? [s.author] : undefined}
						meta={s.count}
					/>
				</SeriesContextMenu>
			)}
			emptyState={
				<EmptyState
					title="No series found"
					description={
						isAudiobook
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
