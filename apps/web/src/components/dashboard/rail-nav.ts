export type RailSection =
	| "home"
	| "my-library"
	| "catalog"
	| "read-listen"
	| "series"
	| "genres"
	| "authors"
	| "narrators"
	| "publishers"
	| null;

export function resolveRailSection(pathname: string): RailSection {
	// The dashboard index match can arrive with a trailing slash
	// ("/dashboard/"); normalize it so Home still owns the route.
	const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
	if (path === "/dashboard") return "home";
	if (path.startsWith("/dashboard/shelves")) return "my-library";
	// The Collections group (shelves + your collections) owns these pages.
	if (path.startsWith("/dashboard/collections")) return "my-library";
	if (path.startsWith("/dashboard/read-listen")) return "read-listen";
	if (path.startsWith("/dashboard/audiobooks")) return "catalog";
	if (path.startsWith("/dashboard/books")) return "catalog";
	if (path.startsWith("/dashboard/series")) return "series";
	if (path.startsWith("/dashboard/genres")) return "genres";
	if (path.startsWith("/dashboard/authors")) return "authors";
	if (path.startsWith("/dashboard/narrators")) return "narrators";
	if (path.startsWith("/dashboard/publishers")) return "publishers";
	return null;
}
