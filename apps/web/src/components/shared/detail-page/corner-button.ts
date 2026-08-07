/**
 * The floating circular controls that flank a detail page's artwork below md,
 * where the layout drops the top bar (MOBILE_CHROMELESS_ROUTE_IDS in the
 * dashboard layout). Callers add the side: `start-3` or `end-3`.
 *
 * Absolute, not fixed: the tab bar below pins to the very top of the scroll
 * panel on these routes, and a fixed control would sit on top of it.
 */
export const DETAIL_CORNER_BUTTON =
	"absolute top-2 z-30 inline-flex size-11 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur-md transition-colors hover:bg-background/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 active:scale-[var(--press-scale)] motion-reduce:active:scale-100 md:hidden";
