const STANDALONE_ROUTES = new Set(["/dashboard/metadata"]);

export type DashboardRoutePresentation = {
	pathname: string;
	search: Record<string, unknown>;
};

/**
 * The last match is the route currently rendered by Outlet. During a pending
 * navigation `location` already points at the destination, so using it here
 * can show the destination chrome around the previous page.
 */
export function getRenderedDashboardRoute(
	matches: ReadonlyArray<DashboardRoutePresentation>,
	fallback: DashboardRoutePresentation,
) {
	return matches[matches.length - 1] ?? fallback;
}

export function isStandaloneDashboardRoute(
	pathname: string,
	search: Record<string, unknown>,
) {
	return (
		STANDALONE_ROUTES.has(pathname) ||
		pathname === "/dashboard/settings" ||
		pathname.startsWith("/dashboard/settings/") ||
		pathname === "/dashboard/server" ||
		pathname.startsWith("/dashboard/server/") ||
		(pathname === "/dashboard/read-listen" && search.review === "matches")
	);
}
