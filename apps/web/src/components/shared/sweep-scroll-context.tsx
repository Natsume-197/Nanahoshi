import { createContext, type ReactNode, useContext } from "react";

/**
 * Marks a subtree where cards sweep under a stationary cursor during scroll —
 * horizontal carousels and virtualized grids both qualify. Cards inside gate
 * their hover-intent prefetch behind a dwell delay so a card merely passing
 * beneath the cursor mid-scroll doesn't fire a route preload + cover download
 * (the storm that janks the dashboard). A deliberate hover still prefetches.
 */
const SweepScrollContext = createContext(false);

export function useInSweepScroll(): boolean {
	return useContext(SweepScrollContext);
}

export function SweepScrollProvider({ children }: { children: ReactNode }) {
	return (
		<SweepScrollContext.Provider value={true}>
			{children}
		</SweepScrollContext.Provider>
	);
}
