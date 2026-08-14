// The tray's filter vocabulary, shared by the route (URL validation + loader
// prefetch) and the component. Both must derive the list query's input the same
// way or the prefetched entry lands under a different query key and is wasted.

export type EnrichmentLifecycle =
	| "archived"
	| "stopped"
	| "scheduled"
	| "review"
	| "unresolved"
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

/** Sidebar root: every bucket at once (archived rows stay out, server-side). */
export const ALL_BUCKETS = "all" as const;
export type BucketFilter = EnrichmentBucket | typeof ALL_BUCKETS;

export const PAGE_SIZE = 50;
export const ALL_LIBRARIES = "__all__";
export const ALL_TYPES = "__all_types__" as const;
export const DEFAULT_BUCKET: BucketFilter = ALL_BUCKETS;
export const DEFAULT_SORT: EnrichmentSort = "recent";

// Mirror of LIFECYCLE_BUCKET in the API's enrichment-lifecycle module: every
// lifecycle lives in exactly one bucket, which is what lets the sidebar jump
// straight to a lifecycle and derive the bucket that must travel with it.
export const LIFECYCLE_BUCKET: Record<EnrichmentLifecycle, EnrichmentBucket> = {
	archived: "history",
	stopped: "stopped",
	scheduled: "in_progress",
	review: "attention",
	unresolved: "attention",
	no_match: "attention",
	partial: "attention",
	failed: "attention",
	running: "in_progress",
	done: "completed",
};

// Sub-filters offered per bucket, in the order the sidebar lists them.
export const BUCKET_LIFECYCLES: Partial<
	Record<EnrichmentBucket, EnrichmentLifecycle[]>
> = {
	in_progress: ["running", "scheduled"],
	attention: ["unresolved", "no_match", "review", "partial", "failed"],
};

export type TraySearch = {
	bucket?: BucketFilter;
	lifecycle?: EnrichmentLifecycle;
	library?: string;
	type?: "ebook" | "audiobook";
	sort?: EnrichmentSort;
	failures?: boolean;
};

/**
 * The list query's input for a set of URL filters. A lifecycle only narrows the
 * bucket it belongs to, so a stale one from a shared link or a bucket switch is
 * dropped rather than emptying the list.
 */
export function listInputFromSearch(
	search: TraySearch,
	extra: { offset?: number; query?: string } = {},
) {
	const bucket = search.bucket ?? DEFAULT_BUCKET;
	const lifecycle =
		search.lifecycle && LIFECYCLE_BUCKET[search.lifecycle] === bucket
			? search.lifecycle
			: undefined;
	return {
		bucket: bucket === ALL_BUCKETS ? undefined : bucket,
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
