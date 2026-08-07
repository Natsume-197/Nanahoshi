export type PageEntry =
	| { type: "page"; page: number; key: string }
	| { type: "ellipsis"; key: string };

/** First and last page always stay reachable; the middle collapses around the
 *  current page once there are more pages than fit. Kept free of component
 *  imports so tests can load it without pulling in the DOM. */
export function generatePageNumbers(
	current: number,
	total: number,
): PageEntry[] {
	if (total <= 7) {
		return Array.from({ length: total }, (_, page) => ({
			type: "page" as const,
			page,
			key: `p-${page}`,
		}));
	}

	const entries: PageEntry[] = [{ type: "page", page: 0, key: "p-0" }];
	const start = Math.max(1, current - 1);
	const end = Math.min(total - 2, current + 1);

	if (start > 1) entries.push({ type: "ellipsis", key: "el-start" });
	for (let page = start; page <= end; page++) {
		entries.push({ type: "page", page, key: `p-${page}` });
	}
	if (end < total - 2) entries.push({ type: "ellipsis", key: "el-end" });

	entries.push({ type: "page", page: total - 1, key: `p-${total - 1}` });
	return entries;
}
