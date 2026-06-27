export type BookSortMode = "title" | "author" | "position";

type SortableBook = {
	title?: string | null;
	filename?: string | null;
	authors?: { name: string }[] | null;
	position?: number | null;
};

/**
 * Client-side search + sort for a bounded book list (a single series, publisher
 * or genre). Filters by title/filename and orders by title, primary author, or
 * series position. Returns a new array; the input is left untouched.
 */
export function filterAndSortBooks<T extends SortableBook>(
	books: T[],
	query: string,
	sort: BookSortMode,
): T[] {
	const q = query.trim().toLowerCase();
	const filtered = q
		? books.filter(
				(b) =>
					(b.title ?? "").toLowerCase().includes(q) ||
					(b.filename ?? "").toLowerCase().includes(q),
			)
		: books;

	const sorted = [...filtered];
	if (sort === "title") {
		sorted.sort((a, b) =>
			(a.title ?? a.filename ?? "").localeCompare(b.title ?? b.filename ?? ""),
		);
	} else if (sort === "author") {
		sorted.sort((a, b) =>
			(a.authors?.[0]?.name ?? "").localeCompare(b.authors?.[0]?.name ?? ""),
		);
	} else if (sort === "position") {
		sorted.sort(
			(a, b) =>
				(a.position ?? Number.POSITIVE_INFINITY) -
				(b.position ?? Number.POSITIVE_INFINITY),
		);
	}
	return sorted;
}
