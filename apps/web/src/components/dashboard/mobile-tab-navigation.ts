export type MobileTabPressAction = "navigate" | "reselect";

function normalizePathname(pathname: string): string {
	if (pathname === "/") return pathname;
	return pathname.replace(/\/+$/, "");
}

/**
 * Native tab bars treat an exact second tap as a request to return to the top.
 * A tap from a nested route still navigates to the tab root first.
 */
export function getMobileTabPressAction(
	currentPathname: string,
	tabHref: string,
): MobileTabPressAction {
	return normalizePathname(currentPathname) === normalizePathname(tabHref)
		? "reselect"
		: "navigate";
}

export function getTabReselectScrollBehavior(
	prefersReducedMotion: boolean,
): ScrollBehavior {
	return prefersReducedMotion ? "auto" : "smooth";
}
