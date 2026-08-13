import { useCallback, useSyncExternalStore } from "react";

// Each piece of chrome collapses at the width where IT stops fitting, not at a
// shared device preset: the sidebar's 17rem rail still leaves a workable panel
// at 768, but the members rail costs another 14rem on top of it.
const MOBILE_BREAKPOINT = 768;
const ACTIVITY_RAIL_BREAKPOINT = 1024;

function useMediaQuery(query: string): boolean {
	const subscribe = useCallback(
		(onChange: () => void) => {
			const mql = window.matchMedia(query);
			mql.addEventListener("change", onChange);
			return () => mql.removeEventListener("change", onChange);
		},
		[query],
	);
	const getSnapshot = useCallback(
		() => window.matchMedia(query).matches,
		[query],
	);

	return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useIsMobile() {
	return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}

/** True below `lg`: too narrow for a main column and a side panel at once. */
export function useIsBelowLg() {
	return useMediaQuery(`(max-width: ${ACTIVITY_RAIL_BREAKPOINT - 1}px)`);
}

/**
 * True below `lg`, where the members rail can't afford an inline column —
 * sidebar + rail would leave the content panel narrower than the same page on a
 * phone — so it opens as a sheet instead.
 */
export function useActivityRailIsSheet() {
	return useIsBelowLg();
}
