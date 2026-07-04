import type { ReactNode } from "react";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import { createBookCardShellRowHeightEstimator } from "@/components/books/book-card-shell";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import {
	CollectionTableHeader,
	CollectionTableRow,
} from "@/components/shared/collection-table-row";
import { CollectionView } from "@/components/shared/collection-view";
import { EmptyState } from "@/components/shared/empty-state";
import type { SortOption } from "@/components/shared/sort-select";
import { useCollectionView } from "@/hooks/use-collection-view";
import { m } from "@/paraglide/messages";
import { getCoverFilename } from "@/utils/covers";
import {
	type BookSortMode,
	filterAndSortBooks,
} from "@/utils/filter-sort-books";
import { resolveYear } from "@/utils/format";

const GRID_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

/** The book shape rendered by an entity detail page (series / genre / publisher). */
export type EntityBook = {
	uuid: string;
	title: string | null;
	filename: string;
	cover?: string | null;
	authors?: { id?: number | null; name: string }[];
	publishedDate?: string | null;
	position?: number | null;
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
	/** Toolbar actions (edit button, download…). */
	extraActions?: ReactNode;
	/** Route-owned siblings such as the edit dialog. */
	children?: ReactNode;
};

/**
 * Shared shell for a single-entity book list (series, genre, publisher): an
 * ebook grid/list with a year column, linking to `/dashboard/books/$uuid`, with
 * the book context menu wired in. Owns view state and client-side filter/sort;
 * the route supplies the data, copy, and any entity-specific actions/dialogs.
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

	const books = useMemo(
		() => filterAndSortBooks(rawBooks ?? [], query, sort),
		[rawBooks, query, sort],
	);

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
				isSearching={isSearching}
				query={query}
				sort={sort}
				onSortChange={setSort}
				sortOptions={sortOptions}
				sortAriaLabel={m["entity_page.sort_aria"]()}
				view={view}
				onViewChange={setView}
				extraActions={extraActions}
				items={books}
				getKey={(book) => book.uuid}
				gridRowEstimate={GRID_ROW_ESTIMATE}
				renderGridItem={(book) => (
					<BookContextMenuTrigger bookUuid={book.uuid}>
						<BookCard
							uuid={book.uuid}
							title={book.title}
							filename={book.filename}
							cover={book.cover ?? null}
							authors={book.authors}
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
					<BookContextMenuTrigger bookUuid={book.uuid}>
						<CollectionTableRow
							index={index + 1}
							linkProps={{
								to: "/dashboard/books/$uuid",
								params: { uuid: book.uuid },
							}}
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
						description={searchNoMatches(query)}
					/>
				}
			/>
			{children}
		</BookContextMenuRoot>
	);
}
