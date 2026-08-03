import type {
	EnrichmentBucket as Bucket,
	EnrichmentLifecycle as Lifecycle,
} from "./filters";

type BucketCounts = Partial<Record<Bucket, number>> | undefined;
type LifecycleCounts = Partial<Record<string, number>> | undefined;

/**
 * What the sidebar's root row counts: everything the tray still tracks.
 * Archived books are excluded, matching the bucket-less list the row opens.
 * Undefined until the first response, so the row renders no number rather
 * than a misleading zero.
 */
export function activeTrayTotal(counts: BucketCounts): number | undefined {
	if (counts == null) return undefined;
	return (
		(counts.in_progress ?? 0) +
		(counts.attention ?? 0) +
		(counts.stopped ?? 0) +
		(counts.completed ?? 0)
	);
}

/**
 * The number for one lifecycle row. The lifecycle tally is computed over
 * non-archived rows only, so "archived" reads its count from the History
 * bucket instead — otherwise the row would always show zero.
 */
export function lifecycleNavCount(
	lifecycle: Lifecycle,
	counts: BucketCounts,
	lifecycleCounts: LifecycleCounts,
): number | undefined {
	if (lifecycle === "archived") return counts?.history;
	return lifecycleCounts?.[lifecycle];
}
