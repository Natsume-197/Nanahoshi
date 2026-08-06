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

/**
 * Where the "Me" tab points. The tab navigates straight to the profile rather
 * than opening a sheet, so it needs a concrete path for both the href and the
 * active/reselect comparison. Without a username `/dashboard/profile` resolves
 * one server-side and redirects.
 */
export function getProfileTabPath(username: string | null | undefined): string {
	const trimmed = username?.trim();
	return trimmed ? `/dashboard/user/${trimmed}` : "/dashboard/profile";
}

export function getTabReselectScrollBehavior(
	prefersReducedMotion: boolean,
): ScrollBehavior {
	return prefersReducedMotion ? "auto" : "smooth";
}
