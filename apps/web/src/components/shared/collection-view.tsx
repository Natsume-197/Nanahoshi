import type { Key, ReactNode } from "react";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { CollectionSearch } from "@/components/shared/collection-search";
import { CollectionToolbar } from "@/components/shared/collection-toolbar";
import { type SortOption, SortSelect } from "@/components/shared/sort-select";
import { type ViewMode, ViewToggle } from "@/components/shared/view-toggle";
import {
	type RowHeightEstimate,
	VirtualizedCardGrid,
} from "@/components/shared/virtualized-card-grid";
import { PAGE_SHELL } from "@/lib/page-layout";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { BOOK_GRID_CLASS } from "@/utils/covers";

const SKELETON_KEYS = Array.from({ length: 12 }, (_, i) => `cv-skeleton-${i}`);

interface CollectionViewProps<TItem, TSort extends string> {
	// Toolbar
	title: ReactNode;
	/** Shown only when not loading and not searching (page passes plain text). */
	subtitle?: ReactNode;
	isLoading: boolean;
	isFetching?: boolean;
	isFetchingNextPage?: boolean;

	// Search
	search: string;
	onSearchChange: (value: string) => void;
	searchPlaceholder: string;
	searchAriaLabel: string;
	isSearching: boolean;
	/** The debounced query, available for empty-state copy. */
	query: string;

	// Sort (omit `sortOptions` to hide the sort control entirely)
	sort: TSort;
	onSortChange: (value: TSort) => void;
	sortOptions?: readonly SortOption<TSort>[];
	sortAriaLabel?: string;
	/** Series-style: hide the sort control while a search is active. */
	hideSortWhileSearching?: boolean;

	/** Page-level actions (Edit, Download…) shown in the toolbar regardless of items. */
	extraActions?: ReactNode;

	/**
	 * Full-width filter row rendered under the toolbar (AniList-style). When set,
	 * the toolbar's built-in controls (search/view/sort/extraActions) are hidden so
	 * the page owns all filtering UI in the bar instead.
	 */
	filterBar?: ReactNode;

	// View toggle
	view: ViewMode;
	onViewChange: (view: ViewMode) => void;

	// Data
	items: TItem[];
	getKey: (item: TItem, index: number) => Key;
	hasNextPage?: boolean;
	fetchNextPage?: () => void;

	// Grid view
	gridRowEstimate: RowHeightEstimate;
	renderGridItem: (item: TItem, index: number) => ReactNode;
	/** Square artwork throughout (audiobooks), so the skeletons match the tiles. */
	squareArtwork?: boolean;
	/**
	 * Column sizing for grids whose tiles are not covers (e.g. the wide genre
	 * plates). Defaults to the shared book-cover grid.
	 */
	gridLayout?: { minTileWidth?: number; minColumns?: number; gap?: number };
	/** Replaces the cover-shaped loading skeletons when the tiles are not covers. */
	gridSkeleton?: ReactNode;

	// List view
	renderListItem: (item: TItem, index: number) => ReactNode;
	listRowEstimate?: RowHeightEstimate;
	/** Optional sticky header row; when set the list is wrapped in a bordered table. */
	listHeader?: ReactNode;

	// Empty states
	emptyState: ReactNode;
	/** Falls back to `emptyState` when omitted. */
	searchEmptyState?: ReactNode;
}

/**
 * Shared chrome for a searchable, sortable, grid/list collection page
 * (likes, series, library …). Owns the toolbar + skeleton + empty + virtualized
 * grid/list layout; callers supply the data and item renderers. Pair with
 * `useCollectionView` for the search/sort/view state.
 */
export function CollectionView<TItem, TSort extends string>({
	title,
	subtitle,
	isLoading,
	isFetching,
	isFetchingNextPage,
	search,
	onSearchChange,
	searchPlaceholder,
	searchAriaLabel,
	isSearching,
	sort,
	onSortChange,
	sortOptions,
	sortAriaLabel = m["common.sort"](),
	hideSortWhileSearching = false,
	extraActions,
	filterBar,
	view,
	onViewChange,
	items,
	getKey,
	hasNextPage,
	fetchNextPage,
	gridRowEstimate,
	renderGridItem,
	squareArtwork = false,
	gridLayout,
	gridSkeleton,
	renderListItem,
	listRowEstimate = 56,
	listHeader,
	emptyState,
	searchEmptyState,
}: CollectionViewProps<TItem, TSort>) {
	const hasItems = items.length > 0;
	const showControls = !isLoading && (hasItems || isSearching);
	const usesFilterBar = !!filterBar;
	const showSort =
		!!sortOptions && hasItems && !(hideSortWhileSearching && isSearching);

	const renderListGrid = () => (
		<VirtualizedCardGrid
			key="list"
			items={items}
			getKey={getKey}
			gap={0}
			columns={1}
			estimateRowHeight={listRowEstimate}
			hasNextPage={hasNextPage}
			isFetchingNextPage={isFetchingNextPage}
			fetchNextPage={fetchNextPage}
			renderItem={renderListItem}
		/>
	);

	return (
		<div className={cn(PAGE_SHELL, "space-y-6")}>
			<CollectionToolbar
				title={title}
				loading={isFetching && !isLoading && !isFetchingNextPage}
				subtitle={
					usesFilterBar || (!isLoading && !isSearching) ? subtitle : undefined
				}
				actions={
					!usesFilterBar && (extraActions || showControls) ? (
						<>
							{extraActions}
							{showControls && (
								<>
									<CollectionSearch
										value={search}
										onChange={onSearchChange}
										placeholder={searchPlaceholder}
										ariaLabel={searchAriaLabel}
									/>
									{hasItems && (
										<ViewToggle view={view} onChange={onViewChange} />
									)}
									{showSort && sortOptions && (
										<SortSelect
											value={sort}
											onChange={onSortChange}
											options={sortOptions}
											ariaLabel={sortAriaLabel}
										/>
									)}
								</>
							)}
						</>
					) : undefined
				}
			/>

			{filterBar}

			{isLoading &&
				(gridSkeleton ?? (
					<div className={BOOK_GRID_CLASS}>
						{SKELETON_KEYS.map((key) => (
							<BookCardSkeleton key={key} square={squareArtwork} />
						))}
					</div>
				))}

			{!isLoading &&
				!hasItems &&
				(isSearching ? (searchEmptyState ?? emptyState) : emptyState)}

			{hasItems &&
				(view === "grid" ? (
					<VirtualizedCardGrid
						key="grid"
						items={items}
						getKey={getKey}
						gap={gridLayout?.gap ?? 8}
						minTileWidth={gridLayout?.minTileWidth}
						minColumns={gridLayout?.minColumns}
						estimateRowHeight={gridRowEstimate}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						fetchNextPage={fetchNextPage}
						renderItem={renderGridItem}
					/>
				) : listHeader ? (
					<div className="overflow-hidden rounded-xl border border-border/60">
						{listHeader}
						{renderListGrid()}
					</div>
				) : (
					renderListGrid()
				))}
		</div>
	);
}
