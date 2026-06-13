import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { type Key, type ReactNode, useCallback, useRef, useState } from "react";
import { useScrollContainerRef } from "@/components/layout/scroll-container-context";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

interface VirtualizedCardGridProps<T> {
	items: T[];
	getKey: (item: T, index: number) => Key;
	renderItem: (item: T, index: number) => ReactNode;
	/** Minimum tile width (px) used to derive the responsive column count. */
	minTileWidth?: number;
	/** Explicit column count. Overrides the width-derived count when set. */
	columns?: number;
	/** Gap between tiles (px), both axes. */
	gap?: number;
	/** Approximate row height (px) used before a row is measured. */
	estimateRowHeight: number;
	hasNextPage?: boolean;
	isFetchingNextPage?: boolean;
	fetchNextPage?: () => void;
}

/** How far before the end (px) to start fetching the next page. */
const PREFETCH_PX = 800;

/**
 * Windowed responsive card grid. Only the rows near the viewport are mounted,
 * so the DOM stays bounded no matter how many items have been loaded.
 *
 * - Column count is derived from the container width (adapts to the sidebar).
 * - Scrolling is driven by the dashboard `<main>` from `useScrollContainerRef`.
 * - `scrollMargin` tracks the grid's offset within that scroll container so a
 *   grid placed below other content (page header, or a second stacked grid as
 *   on search/author pages) still virtualizes against the right position.
 * - The next page is fetched from a sentinel near the bottom (reusing
 *   `useInfiniteScroll`).
 */
export function VirtualizedCardGrid<T>({
	items,
	getKey,
	renderItem,
	minTileWidth = 150,
	columns: columnsOverride,
	gap = 16,
	estimateRowHeight,
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
}: VirtualizedCardGridProps<T>) {
	const scrollContainerRef = useScrollContainerRef();
	const nodeRef = useRef<HTMLDivElement | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const [containerWidth, setContainerWidth] = useState(0);
	const [scrollMargin, setScrollMargin] = useState(0);

	// Measure the grid's width (for columns) and its offset within the scroll
	// container (for scrollMargin). The offset is scroll-invariant, so it only
	// needs recomputing when sizes change — never per scroll frame.
	const measure = useCallback(() => {
		const node = nodeRef.current;
		if (!node) return;
		setContainerWidth(node.clientWidth);
		const scrollEl = scrollContainerRef?.current;
		if (!scrollEl) return;
		const offset =
			node.getBoundingClientRect().top -
			scrollEl.getBoundingClientRect().top +
			scrollEl.scrollTop;
		setScrollMargin((prev) => (Math.abs(prev - offset) > 1 ? offset : prev));
	}, [scrollContainerRef]);

	// Ref callback wires up observers (no useEffect); cleanup runs on detach.
	// Observing the grid (width) and the scroll container's content (the grid's
	// offset, which shifts when content above it — e.g. a stacked grid — grows)
	// covers every case scrollMargin/columns depend on, without a scroll
	// listener doing per-frame layout reads.
	const gridRef = useCallback(
		(node: HTMLDivElement | null) => {
			cleanupRef.current?.();
			cleanupRef.current = null;
			nodeRef.current = node;
			if (!node) return;

			measure();
			const observer = new ResizeObserver(() => measure());
			observer.observe(node);
			const content = scrollContainerRef?.current?.firstElementChild;
			if (content) observer.observe(content);

			cleanupRef.current = () => observer.disconnect();
		},
		[measure, scrollContainerRef],
	);

	const columns =
		columnsOverride ??
		(containerWidth > 0
			? Math.max(1, Math.floor((containerWidth + gap) / (minTileWidth + gap)))
			: 1);
	const rowCount = Math.ceil(items.length / columns);

	const rowVirtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => scrollContainerRef?.current ?? null,
		estimateSize: () => estimateRowHeight,
		overscan: 4,
		gap,
		scrollMargin,
	});

	const { loadMoreRef } = useInfiniteScroll({
		hasNextPage,
		isFetchingNextPage: isFetchingNextPage ?? false,
		fetchNextPage: fetchNextPage ?? (() => {}),
		enabled: Boolean(hasNextPage && fetchNextPage),
		root: scrollContainerRef?.current ?? null,
	});

	return (
		<div ref={gridRef}>
			<div
				className="relative w-full"
				style={{ height: rowVirtualizer.getTotalSize() }}
			>
				{rowVirtualizer.getVirtualItems().map((virtualRow) => {
					const start = virtualRow.index * columns;
					const rowItems = items.slice(start, start + columns);
					return (
						<div
							key={virtualRow.key}
							data-index={virtualRow.index}
							ref={rowVirtualizer.measureElement}
							className="absolute top-0 left-0 grid w-full"
							style={{
								transform: `translateY(${virtualRow.start - scrollMargin}px)`,
								gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
								gap: `${gap}px`,
							}}
						>
							{rowItems.map((item, i) => {
								const index = start + i;
								return (
									<div key={getKey(item, index)}>{renderItem(item, index)}</div>
								);
							})}
						</div>
					);
				})}

				{hasNextPage && (
					<div
						ref={loadMoreRef}
						aria-hidden
						className="pointer-events-none absolute right-0 bottom-0 left-0"
						style={{ height: PREFETCH_PX }}
					/>
				)}
			</div>

			{isFetchingNextPage && (
				<div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-sm">
					<Loader2 className="size-4 animate-spin" />
					Loading more...
				</div>
			)}
		</div>
	);
}
