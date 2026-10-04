/** The welcome is a short story told in slides, then a page to sign in. */
export const INTRO_SLIDES = 3;
export const LAST_SLIDE = INTRO_SLIDES - 1;

/**
 * The story is told once: someone signing out again, or coming back from
 * picking a server, goes straight to the sign-in page.
 */
export function skipIntro({
	seen,
	justConnected,
}: {
	seen: boolean;
	justConnected: boolean;
}): boolean {
	return seen || justConnected;
}

/** The page a horizontal pager rests on, from its scroll offset. */
export function slideAt(offsetX: number, pageWidth: number): number {
	if (pageWidth <= 0) return 0;
	return Math.min(LAST_SLIDE, Math.max(0, Math.round(offsetX / pageWidth)));
}
