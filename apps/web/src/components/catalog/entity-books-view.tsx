import type { ReactNode } from "react";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import { createBookCardShellRowHeightEstimator } from "@/components/books/book-card-shell";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
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
import { useUiSnapshotState } from "@/hooks/use-ui-snapshot-state";
import { m } from "@/paraglide/messages";
import { getCoverFilename } from "@/utils/covers";
import {
	type BookSortMode,
	filterAndSortBooks,
} from "@/utils/filter-sort-books";
import { resolveYear } from "@/utils/format";

const GRID_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

type EntityFormat = "ebook" | "audiobook";

/** The book shape rendered by an entity detail page (series / genre / publisher). */
export type EntityBook = {
	uuid: string;
	title: string | null;
	filename: string;
	cover?: string | null;
	authors?: { id?: number | null; name: string }[];
	publishedDate?: string | null;
	position?: number | null;
	/** Rows without a media type render as ebooks (series/publisher pages). */
	mediaType?: "ebook" | "audiobook";
};

type EntityBooksViewProps<T extends EntityBook> = {
	storageKey: string;
	defaultSort: BookSortMode;
	sortOptions: readonly SortOption<BookSortMode>[];
	/** Page title (entity name, or a fallback while it loads). */
	title: ReactNode;
	/** Rendered subtitle — the route owns the count/rating copy. */
	subtitle?: ReactNode;
	isLoading: boolean;
	/** Full (unpaginated) book list; filtered and sorted client-side. */
	rawBooks: T[] | undefined;
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
 * a book grid/list with a year column and the book context menu wired in. Rows
 * carrying a `mediaType` link to their own format's detail page. Owns view
 * state and client-side filter/sort; the route supplies data, copy, and any
 * entity-specific actions/dialogs.
 */
export function EntityBooksView<T extends EntityBook>({
	storageKey,
	defaultSort,
	sortOptions,
	title,
	subtitle,
	isLoading,
	rawBooks,
	searchAriaLabel,
	emptyDescription,
	searchNoMatches,
	formatFilter = false,
	extraActions,
	children,
}: EntityBooksViewProps<T>) {
	const {
		view,
		setView,
		sort,
		setSort,
		search,
		setSearch,
		query,
		isSearching,
	} = useCollectionView<BookSortMode>({ storageKey, defaultSort });

	// null = auto: land on the entity's first available format.
	const [formatChoice, setFormatChoice] =
		useUiSnapshotState<EntityFormat | null>(`${storageKey}-format`, null);
	const defaultFormat: EntityFormat = useMemo(() => {
		const rows = rawBooks ?? [];
		if (rows.length === 0) return "ebook";
		return rows.some((b) => (b.mediaType ?? "ebook") === "ebook")
			? "ebook"
			: "audiobook";
	}, [rawBooks]);
	const format = formatChoice ?? defaultFormat;

	const books = useMemo(() => {
		const rows = formatFilter
			? (rawBooks ?? []).filter((b) => (b.mediaType ?? "ebook") === format)
			: (rawBooks ?? []);
		return filterAndSortBooks(rows, query, sort);
	}, [rawBooks, formatFilter, format, query, sort]);

	const linkFor = (book: EntityBook) =>
		book.mediaType === "audiobook"
			? ({
					to: "/dashboard/audiobooks/$uuid",
					params: { uuid: book.uuid },
				} as const)
			: ({
					to: "/dashboard/books/$uuid",
					params: { uuid: book.uuid },
				} as const);

	const formatOptions: readonly FilterOption[] = [
		{ value: "ebook", label: m["search.books"]() },
		{ value: "audiobook", label: m["search.audiobooks"]() },
	];

	// Same filter-bar layout as Browse (catalog-view): search, format, sort, view.
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
			<FilterField label={m["library_page.view"]()}>
				<ViewToggle view={view} onChange={setView} fullWidth />
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
				subtitle={subtitle}
				isLoading={isLoading}
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
				view={view}
				onViewChange={setView}
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
							authors={book.authors}
							mediaType={book.mediaType ?? "ebook"}
							contextMenuEnabled={false}
						/>
					</BookContextMenuTrigger>
				)}
				listHeader={
					<CollectionTableHeader
						metaLabel={m["library_page.list_meta_year"]()}
					/>
				}
				renderListItem={(book, index) => (
					<BookContextMenuTrigger
						bookUuid={book.uuid}
						mediaType={book.mediaType ?? "ebook"}
					>
						<CollectionTableRow
							index={index + 1}
							linkProps={linkFor(book)}
							coverFilename={getCoverFilename(book.cover)}
							title={book.title ?? book.filename}
							authors={book.authors}
							meta={resolveYear(book.publishedDate)}
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
