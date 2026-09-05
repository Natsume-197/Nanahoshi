import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import {
	type Key,
	memo,
	type ReactNode,
	useCallback,
	useRef,
	useState,
} from "react";
import { useScrollContainerRef } from "@/components/layout/scroll-container-context";

function ResultContent<T>({
	item,
	renderItem,
}: {
	item: T;
	renderItem: (item: T) => ReactNode;
}) {
	return renderItem(item);
}
const MemoizedResultContent = memo(ResultContent) as typeof ResultContent;

/** Keep keyboard neighbours mounted even when the focused result scrolls away. */
export function includeFocusedNeighbours(
	indices: number[],
	focused: number | null,
	count: number,
) {
	if (focused == null) return indices;
	return [
		...new Set([
			...indices,
			...[focused - 1, focused, focused + 1].filter((i) => i >= 0 && i < count),
		]),
	].sort((a, b) => a - b);
}

/** A windowed semantic list sharing the dashboard's scroll container. */
export function VirtualizedResultList<T>({
	items,
	getKey,
	renderItem,
}: {
	items: T[];
	getKey: (item: T) => Key;
	renderItem: (item: T) => ReactNode;
}) {
	const scrollContainer = useScrollContainerRef();
	const [scrollMargin, setScrollMargin] = useState(0);
	const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const listRef = useCallback(
		(node: HTMLUListElement | null) => {
			cleanupRef.current?.();
			cleanupRef.current = null;
			if (!node) return;
			const measure = () => {
				const scroll = scrollContainer?.current;
				if (!scroll) return;
				setScrollMargin(
					node.getBoundingClientRect().top -
						scroll.getBoundingClientRect().top +
						scroll.scrollTop,
				);
			};
			measure();
			const observer = new ResizeObserver(measure);
			observer.observe(node);
			if (node.parentElement) observer.observe(node.parentElement);
			const content = scrollContainer?.current?.firstElementChild;
			if (content) observer.observe(content);
			cleanupRef.current = () => observer.disconnect();
		},
		[scrollContainer],
	);
	const getItemKey = useCallback(
		(index: number) => getKey(items[index]),
		[getKey, items],
	);
	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => scrollContainer?.current ?? null,
		getItemKey,
		estimateSize: () => 137,
		overscan: 4,
		scrollMargin,
		rangeExtractor: (range) =>
			includeFocusedNeighbours(
				defaultRangeExtractor(range),
				focusedIndex,
				items.length,
			),
	});

	return (
		<ul
			ref={listRef}
			className="relative w-full"
			style={{ height: virtualizer.getTotalSize() }}
			onFocusCapture={(event) => {
				const row = (event.target as HTMLElement).closest<HTMLElement>(
					"[data-result-index]",
				);
				if (row) setFocusedIndex(Number(row.dataset.resultIndex));
			}}
			onBlurCapture={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget))
					setFocusedIndex(null);
			}}
		>
			{virtualizer.getVirtualItems().map((row) => (
				<li
					key={row.key}
					ref={virtualizer.measureElement}
					data-index={row.index}
					data-result-index={row.index}
					aria-posinset={row.index + 1}
					aria-setsize={items.length}
					className="absolute top-0 left-0 w-full border-border/60 border-b last:border-b-0"
					style={{ transform: `translateY(${row.start - scrollMargin}px)` }}
				>
					<MemoizedResultContent
						item={items[row.index]}
						renderItem={renderItem}
					/>
				</li>
			))}
		</ul>
	);
}
