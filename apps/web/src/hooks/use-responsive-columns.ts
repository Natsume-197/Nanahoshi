import { useCallback, useRef, useState } from "react";

interface UseResponsiveColumnsOptions {
	/** Minimum tile width (px) used to derive the responsive column count. */
	minTileWidth: number;
	/** Horizontal gap (px) between tiles. */
	gap: number;
	/** Minimum column count, even on narrow widths. */
	minColumns?: number;
}

/**
 * Measures an element's width (via a ref callback + ResizeObserver, no effect)
 * and derives how many tiles fit per row — mirroring the auto-fill column math
 * of `BOOK_GRID_CLASS`. Attach `ref` to the element whose width equals the grid
 * width; read `columns` to render an explicit, row-exact grid.
 */
export function useResponsiveColumns({
	minTileWidth,
	gap,
	minColumns = 1,
}: UseResponsiveColumnsOptions) {
	const nodeRef = useRef<HTMLDivElement | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const frameRef = useRef<number | null>(null);
	const [width, setWidth] = useState(0);

	const measure = useCallback(() => {
		const node = nodeRef.current;
		if (!node) return;
		const w = node.clientWidth;
		setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
	}, []);

	const schedule = useCallback(() => {
		if (frameRef.current != null) return;
		frameRef.current = window.requestAnimationFrame(() => {
			frameRef.current = null;
			measure();
		});
	}, [measure]);

	const ref = useCallback(
		(node: HTMLDivElement | null) => {
			cleanupRef.current?.();
			cleanupRef.current = null;
			nodeRef.current = node;
			if (!node) return;
			measure();
			const observer = new ResizeObserver(schedule);
			observer.observe(node);
			cleanupRef.current = () => {
				if (frameRef.current != null) {
					window.cancelAnimationFrame(frameRef.current);
					frameRef.current = null;
				}
				observer.disconnect();
			};
		},
		[measure, schedule],
	);

	const columns =
		width > 0
			? Math.max(minColumns, Math.floor((width + gap) / (minTileWidth + gap)))
			: minColumns;

	return { ref, columns };
}
