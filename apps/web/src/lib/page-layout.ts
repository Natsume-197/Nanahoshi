/**
 * The horizontal gutter every routed dashboard page sits in.
 *
 * Every page shares one content panel, so a page whose gutter differs reads as
 * the whole layout jumping sideways as you navigate — and on mobile it also
 * breaks the line the navbar's server badge is aligned to (the header carries
 * the same 1rem below md). Keep this in step with the header's `px-4 md:px-3
 * lg:px-4` and the home page's own ladder.
 */
export const PAGE_GUTTER = "px-4 md:px-6 lg:px-8";

/** The standard routed-page shell: the gutter plus the usual vertical rhythm. */
export const PAGE_SHELL = `${PAGE_GUTTER} py-6 lg:py-8`;

/**
 * Cancels PAGE_GUTTER so a row can bleed to the panel edge. The children that
 * should still line up with the page (a rail's heading, its scroll track)
 * re-apply PAGE_GUTTER themselves. Both must move together — hardcoding either
 * side is how the rails drift off the page margin.
 */
export const PAGE_GUTTER_BLEED = "-mx-4 md:-mx-6 lg:-mx-8";
