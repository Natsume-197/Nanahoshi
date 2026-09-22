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
	if (lifecycle === "review" && lifecycleCounts) {
		return (
			(lifecycleCounts.review ?? 0) +
			(lifecycleCounts.unresolved ?? 0) +
			(lifecycleCounts.partial ?? 0)
		);
	}
	return lifecycleCounts?.[lifecycle];
}
