export type RailSection =
	| "home"
	| "catalog"
	| "read-listen"
	| "collections"
	| "series"
	| "genres"
	| "more"
	| null;

const MORE_PREFIXES = [
	"/dashboard/authors",
	"/dashboard/narrators",
	"/dashboard/publishers",
];

export function resolveRailSection(pathname: string): RailSection {
	// The dashboard index match can arrive with a trailing slash
	// ("/dashboard/"); normalize it so Home still owns the route.
	const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
	if (path === "/dashboard") return "home";
	if (path.startsWith("/dashboard/read-listen")) return "read-listen";
	if (path.startsWith("/dashboard/audiobooks")) return "catalog";
	if (path.startsWith("/dashboard/books")) return "catalog";
	if (path.startsWith("/dashboard/collections")) return "collections";
	if (path.startsWith("/dashboard/series")) return "series";
	if (path.startsWith("/dashboard/genres")) return "genres";
	if (MORE_PREFIXES.some((prefix) => path.startsWith(prefix))) return "more";
	return null;
}
