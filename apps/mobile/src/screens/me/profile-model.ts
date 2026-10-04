type Row = { bookUuid: string };
type Page<T extends Row> = { items: T[]; total: number } | undefined;

export type RailSource<T extends Row> = {
	key: string;
	label: string;
	kind: "book" | "audiobook";
	/** Shelves merged into one rail ("backlog" + "want to read"). */
	pages: Page<T>[];
	status: string | "all";
};

export type Rail<T extends Row> = Omit<RailSource<T>, "pages"> & {
	items: T[];
	total: number;
};

/** Merges each source's shelves and drops the empty rails, keeping order. */
export function buildRails<T extends Row>(sources: RailSource<T>[]): Rail<T>[] {
	return sources
		.map(({ pages, ...source }) => {
			const seen = new Set<string>();
			const items = pages
				.flatMap((page) => page?.items ?? [])
				.filter((row) => !seen.has(row.bookUuid) && !!seen.add(row.bookUuid));
			const total = pages.reduce((sum, page) => sum + (page?.total ?? 0), 0);
			return { ...source, items, total };
		})
		.filter((rail) => rail.items.length > 0);
}
