import { useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

/**
 * Card grid layout shared by collection pages. The CSS class (for plain/skeleton
 * grids) and the JS column counts below describe the SAME breakpoints — keep
 * them in sync.
 */
export const CARD_GRID_CLASS =
	"grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

const BREAKPOINTS = [
	{ min: 1280, cols: 6 },
	{ min: 1024, cols: 5 },
	{ min: 768, cols: 4 },
	{ min: 640, cols: 3 },
	{ min: 0, cols: 2 },
] as const;

function columnsForWidth(width: number): number {
	return BREAKPOINTS.find((b) => width >= b.min)?.cols ?? 2;
}

/** Viewport-breakpoint column count matching the likes page grid. */
export function useGridColumns(): number {
	const [columns, setColumns] = useState(2);

	// One-time external sync to viewport size on mount — the sanctioned use of
	// useMountEffect (see CLAUDE.md "No useEffect Rule").
	useMountEffect(() => {
		const onResize = () => setColumns(columnsForWidth(window.innerWidth));
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	});

	return columns;
}
