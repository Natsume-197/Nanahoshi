export type RailSection =
	| "home"
	| "catalog"
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
	if (pathname === "/dashboard") return "home";
	if (pathname.startsWith("/dashboard/read-listen")) return "catalog";
	if (pathname.startsWith("/dashboard/audiobooks")) return "catalog";
	if (pathname.startsWith("/dashboard/books")) return "catalog";
	if (pathname.startsWith("/dashboard/collections")) return "collections";
	if (pathname.startsWith("/dashboard/series")) return "series";
	if (pathname.startsWith("/dashboard/genres")) return "genres";
	if (MORE_PREFIXES.some((prefix) => pathname.startsWith(prefix)))
		return "more";
	return null;
}
