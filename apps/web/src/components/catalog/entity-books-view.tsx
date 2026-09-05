import { useInfiniteQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import { createBookCardShellRowHeightEstimator } from "@/components/books/book-card-shell";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { QueryErrorState } from "@/components/libraries/query-error-state";
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
import { m } from "@/paraglide/messages";
import {
	type BookSortMode,
	filterAndSortBooks,
} from "@/utils/filter-sort-books";
import { orpc } from "@/utils/orpc";

const GRID_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

type EntityFormat = "ebook" | "audiobook";

/** The book shape rendered by an entity detail page (series / genre / publisher). */
export type EntityBook = {
	uuid: string;
	title: string | null;
	filename: string;
	cover?: string | null;
	/** Cover's dominant color (hex); tints the loading placeholder. */
	mainColor?: string | null;
	authors?: { id?: number | null; name: string }[];
	publishedDate?: string | null;
	position?: number | null;
	/** Rows without a media type render as ebooks (series/publisher pages). */
	mediaType?: "ebook" | "audiobook";
};

type EntityBooksViewProps = {
	storageKey: string;
	defaultSort: BookSortMode;
	sortOptions: readonly SortOption<BookSortMode>[];
	/** Page title (entity name, or a fallback while it loads). */
	title: ReactNode;
	/** Rendered subtitle — the route owns the count/rating copy. */
	subtitle?: ReactNode;
	isLoading?: boolean;
	/** Full (unpaginated) book list; filtered and sorted client-side. */
	rawBooks?: EntityBook[];
	source?: { kind: "genre" | "tag" | "publisher"; uuid: string };
	countLabel?: (total: number) => ReactNode;
	searchAriaLabel: string;
	emptyDescription: string;
	/** Search-empty sentence; receives the active debounced query. */
	searchNoMatches: (query: string) => string;
	/**
	 * Format-aware pages (genre/tag): always show the AniList filter bar with a
	 * Books/Audiobooks select. Formats are never mixed in one listing — the
	 * select shows exactly one format at a time.
	 */
	formatFilter?: boolean;
	/** Toolbar actions (edit button, download…). */
	extraActions?: ReactNode;
	/** Route-owned siblings such as the edit dialog. */
	children?: ReactNode;
};

/**
 * Shared shell for a single-entity book list (series, genre, tag, publisher):
 * a book grid with the book context menu wired in. Items carrying a `mediaType`
 * link to their own format's detail page. Owns client-side filter/sort; the
 * route supplies data, copy, and any entity-specific actions/dialogs.
 */
export function EntityBooksView({
	storageKey,
	defaultSort,
	sortOptions,
	title,
	subtitle,
	isLoading = false,
	rawBooks,
	source,
	countLabel,
	searchAriaLabel,
	emptyDescription,
	searchNoMatches,
	formatFilter = false,
	extraActions,
	children,
}: EntityBooksViewProps) {
	const { sort, setSort, search, setSearch, query, isSearching } =
		useCollectionView<BookSortMode>({ storageKey, defaultSort });

	// null = auto: land on the entity's first available format.
	const [formatChoice, setFormatChoice] =
		useUiSnapshotState<EntityFormat | null>(`${storageKey}-format`, null);
	const pagedBooks = useInfiniteQuery({
		...orpc.books.listByEntity.infiniteOptions({
			input: (cursor: number) => ({
				kind: source?.kind ?? "genre",
				uuid: source?.uuid ?? "",
				format: formatFilter ? (formatChoice ?? "auto") : "ebook",
				sort: sort === "author" ? "author" : "title",
				query: query || undefined,
				cursor,
				limit: 40,
			}),
			initialPageParam: 0,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
		}),
		enabled: Boolean(source),
	});
	const firstPage = pagedBooks.data?.pages[0];
	const defaultFormat: EntityFormat = useMemo(() => {
		const rows = rawBooks ?? [];
		if (rows.length === 0) return "ebook";
		return rows.some((b) => (b.mediaType ?? "ebook") === "ebook")
			? "ebook"
			: "audiobook";
	}, [rawBooks]);
	const format = formatChoice ?? firstPage?.format ?? defaultFormat;

	const books = useMemo(() => {
		if (source)
			return pagedBooks.data?.pages.flatMap((page) => page.books) ?? [];
		const rows = formatFilter
			? (rawBooks ?? []).filter((b) => (b.mediaType ?? "ebook") === format)
			: (rawBooks ?? []);
		return filterAndSortBooks(rows, query, sort);
	}, [rawBooks, formatFilter, format, query, sort, source, pagedBooks.data]);

	const formatOptions: readonly FilterOption[] = [
		{ value: "ebook", label: m["search.books"]() },
		{ value: "audiobook", label: m["search.audiobooks"]() },
	];

	// Same filter-bar layout as Browse (catalog-view): search, format and sort.
	const filterBar = formatFilter ? (
		<FilterBar>
			<FilterField
				label={m["library_page.search"]()}
				className="col-span-full lg:col-span-2"
			>
				<CollectionSearch
					value={search}
					onChange={setSearch}
					placeholder={m["entity_page.search_placeholder"]()}
					ariaLabel={searchAriaLabel}
					className="sm:w-full"
				/>
			</FilterField>
			<FilterField label={m["media.format"]()}>
				<FilterSelect
					value={format}
					onChange={(v) => setFormatChoice(v as EntityFormat)}
					options={formatOptions}
					ariaLabel={m["media.format"]()}
				/>
			</FilterField>
			<FilterField label={m["common.sort"]()}>
				<FilterSelect
					value={sort}
					onChange={(v) => setSort(v as BookSortMode)}
					options={sortOptions}
					ariaLabel={m["entity_page.sort_aria"]()}
				/>
			</FilterField>
			{extraActions ? (
				<div className="flex items-end justify-end">{extraActions}</div>
			) : null}
		</FilterBar>
	) : undefined;

	// A manual format pick that empties the list reads as an active filter, so
	// the "no matches" state applies instead of the entity-empty one.
	const hasActiveFilter = isSearching || (formatFilter && formatChoice != null);

	return (
		<BookContextMenuRoot>
			<CollectionView
				title={title}
				subtitle={
					source && firstPage ? countLabel?.(firstPage.total) : subtitle
				}
				isLoading={isLoading || (Boolean(source) && pagedBooks.isLoading)}
				isFetching={Boolean(source) && pagedBooks.isFetching}
				isError={Boolean(source) && pagedBooks.isError}
				errorState={
					<QueryErrorState
						onRetry={() => {
							void pagedBooks.refetch();
						}}
					/>
				}
				isFetchingNextPage={Boolean(source) && pagedBooks.isFetchingNextPage}
				hasNextPage={
					Boolean(source) &&
					pagedBooks.hasNextPage &&
					!pagedBooks.isFetchNextPageError
				}
				fetchNextPage={() => {
					if (source && !pagedBooks.isFetching) void pagedBooks.fetchNextPage();
				}}
				contentBefore={
					source && pagedBooks.isFetchNextPageError ? (
						<QueryErrorState
							compact
							onRetry={() => {
								void pagedBooks.fetchNextPage();
							}}
						/>
					) : undefined
				}
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder={m["entity_page.search_placeholder"]()}
				searchAriaLabel={searchAriaLabel}
				isSearching={hasActiveFilter}
				query={query}
				sort={sort}
				onSortChange={setSort}
				sortOptions={sortOptions}
				sortAriaLabel={m["entity_page.sort_aria"]()}
				extraActions={extraActions}
				filterBar={filterBar}
				items={books}
				getKey={(book) => book.uuid}
				gridRowEstimate={GRID_ROW_ESTIMATE}
				renderGridItem={(book) => (
					<BookContextMenuTrigger
						bookUuid={book.uuid}
						mediaType={book.mediaType ?? "ebook"}
					>
						<BookCard
							uuid={book.uuid}
							title={book.title}
							filename={book.filename}
							cover={book.cover ?? null}
							tint={book.mainColor}
							authors={book.authors}
							mediaType={book.mediaType ?? "ebook"}
							contextMenuEnabled={false}
						/>
					</BookContextMenuTrigger>
				)}
				emptyState={
					<EmptyState
						title={m["entity_page.empty_title"]()}
						description={emptyDescription}
					/>
				}
				searchEmptyState={
					<EmptyState
						title={m["settings.no_matches"]()}
						description={
							query
								? searchNoMatches(query)
								: m["library_page.no_filter_matches"]()
						}
					/>
				}
			/>
			{children}
		</BookContextMenuRoot>
	);
}
