export type RailState = "expanded" | "collapsed";

export const RAIL_COOKIE_NAME = "rail_state";
export const RAIL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseRailState(value: string | null | undefined): RailState {
	return value === "collapsed" ? "collapsed" : "expanded";
}

export function readRailState(
	cookieHeader: string | null | undefined,
): RailState {
	if (!cookieHeader) return "expanded";
	const match = cookieHeader.match(
		new RegExp(`(?:^|;\\s*)${RAIL_COOKIE_NAME}=([^;]*)`),
	);
	return parseRailState(match?.[1]);
}

export function railStateCookie(state: RailState): string {
	return `${RAIL_COOKIE_NAME}=${state}; path=/; max-age=${RAIL_COOKIE_MAX_AGE}; samesite=lax`;
}

export type RailDirection = "opening" | "closing";

export function railDirection(next: RailState): RailDirection {
	return next === "expanded" ? "opening" : "closing";
}

export const RAIL_ANIM_MS = 320;

export const RAIL_WIDTH_COOKIE_NAME = "rail_width";
export const RAIL_WIDTH_DEFAULT = 256;
export const RAIL_WIDTH_MIN = 220;
export const RAIL_WIDTH_MAX = 480;
/** Dragging the expanded rail narrower than this snaps it shut, and dragging
 *  the collapsed rail past it opens it, like Spotify's library. */
export const RAIL_COLLAPSE_THRESHOLD = 160;
export const RAIL_WIDTH_KEY_STEP = 16;

export function clampRailWidth(width: number): number {
	return Math.round(Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, width)));
}

export function readRailWidth(
	cookieHeader: string | null | undefined,
): number | null {
	const match = cookieHeader?.match(
		new RegExp(`(?:^|;\\s*)${RAIL_WIDTH_COOKIE_NAME}=([^;]*)`),
	);
	const width = Number.parseFloat(match?.[1] ?? "");
	return Number.isFinite(width) ? clampRailWidth(width) : null;
}

export function railWidthCookie(width: number): string {
	return `${RAIL_WIDTH_COOKIE_NAME}=${clampRailWidth(width)}; path=/; max-age=${RAIL_COOKIE_MAX_AGE}; samesite=lax`;
}

/** Where a drag of the rail's edge to `pointerWidth` px leaves the rail. */
export function resolveRailDrag(
	pointerWidth: number,
): { state: "collapsed" } | { state: "expanded"; width: number } {
	if (pointerWidth < RAIL_COLLAPSE_THRESHOLD) return { state: "collapsed" };
	return { state: "expanded", width: clampRailWidth(pointerWidth) };
}
