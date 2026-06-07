import { createContext, type RefObject, useContext } from "react";

/**
 * Holds a ref to the dashboard's scroll container (`<main>`). Virtualized grids
 * read it so `@tanstack/react-virtual` knows which element actually scrolls —
 * the layout makes `<main>` the scroll container on every viewport.
 */
const ScrollContainerContext =
	createContext<RefObject<HTMLElement | null> | null>(null);

export const ScrollContainerProvider = ScrollContainerContext.Provider;

export function useScrollContainerRef(): RefObject<HTMLElement | null> | null {
	return useContext(ScrollContainerContext);
}
