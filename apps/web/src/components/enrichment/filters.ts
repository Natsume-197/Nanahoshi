// The tray's filter vocabulary, shared by the route (URL validation + loader
// prefetch) and the component. Both must derive the list query's input the same
// way or the prefetched entry lands under a different query key and is wasted.

export type EnrichmentLifecycle =
	| "archived"
	| "stopped"
	| "scheduled"
	| "review"
	| "no_match"
	| "partial"
	| "failed"
	| "running"
	| "done";

export type EnrichmentBucket =
	| "in_progress"
	| "attention"
	| "stopped"
	| "completed"
	| "history";

export type EnrichmentSort = "recent" | "oldest" | "title";
export type MediaTypeFilter = "ebook" | "audiobook" | typeof ALL_TYPES;

export const PAGE_SIZE = 50;
export const ALL_LIBRARIES = "__all__";
export const ALL_TYPES = "__all_types__" as const;
export const DEFAULT_BUCKET: EnrichmentBucket = "in_progress";
export const DEFAULT_SORT: EnrichmentSort = "recent";

// Sub-filters offered per bucket, in the order the chips appear. Only buckets
// holding more than one lifecycle get a row; the rest need no narrowing.
export const BUCKET_LIFECYCLES: Partial<
	Record<EnrichmentBucket, EnrichmentLifecycle[]>
> = {
	in_progress: ["running", "scheduled"],
	attention: ["no_match", "review", "partial", "failed"],
};

export type TraySearch = {
	bucket?: EnrichmentBucket;
	lifecycle?: EnrichmentLifecycle;
	library?: string;
	type?: "ebook" | "audiobook";
	sort?: EnrichmentSort;
	failures?: boolean;
};

/**
 * The list query's input for a set of URL filters. A lifecycle only narrows the
 * bucket that offers it as a chip, so a stale one from a shared link or a bucket
 * switch is dropped rather than emptying the list.
 */
export function listInputFromSearch(
	search: TraySearch,
	extra: { offset?: number; query?: string } = {},
) {
	const bucket = search.bucket ?? DEFAULT_BUCKET;
	const lifecycle =
		search.lifecycle && BUCKET_LIFECYCLES[bucket]?.includes(search.lifecycle)
			? search.lifecycle
			: undefined;
	return {
		bucket,
		lifecycle,
		libraryUuid:
			search.library && search.library !== ALL_LIBRARIES
				? search.library
				: undefined,
		mediaType: search.type,
		withFailures: search.failures || undefined,
		query: extra.query?.trim() || undefined,
		sort: search.sort ?? DEFAULT_SORT,
		limit: PAGE_SIZE,
		offset: extra.offset ?? 0,
	};
}
