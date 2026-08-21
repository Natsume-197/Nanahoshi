export type RailState = "expanded" | "collapsed";

export const RAIL_COOKIE_NAME = "rail_state";
export const RAIL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseRailState(value: string | null | undefined): RailState {
	return value === "expanded" ? "expanded" : "collapsed";
}

export function readRailState(
	cookieHeader: string | null | undefined,
): RailState {
	if (!cookieHeader) return "collapsed";
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
