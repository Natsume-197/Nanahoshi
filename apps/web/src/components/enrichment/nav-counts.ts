import type {
	EnrichmentBucket as Bucket,
	EnrichmentLifecycle as Lifecycle,
} from "./filters";

type BucketCounts = Partial<Record<Bucket, number>> | undefined;
type LifecycleCounts = Partial<Record<string, number>> | undefined;

/** What the sidebar's root row counts. */
export function activeTrayTotal(counts: BucketCounts): number | undefined {
	if (counts == null) return undefined;
	return (
		(counts.in_progress ?? 0) +
		(counts.attention ?? 0) +
		(counts.completed ?? 0)
	);
}

/** The number for one lifecycle row. */
export function lifecycleNavCount(
	lifecycle: Lifecycle,
	_counts: BucketCounts,
	lifecycleCounts: LifecycleCounts,
): number | undefined {
	if (lifecycleCounts == null) return undefined;
	// The API omits empty lifecycles, so once counts have loaded a missing key
	// is a real zero rather than "unknown".
	return lifecycleCounts[lifecycle] ?? 0;
}
