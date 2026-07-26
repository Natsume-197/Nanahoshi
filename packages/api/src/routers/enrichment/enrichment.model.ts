import { z } from "zod";

// Task-oriented tray buckets (see modules/metadataEnrichment/enrichment-lifecycle).
export const EnrichmentBucketEnum = z.enum([
	"in_progress",
	"attention",
	"stopped",
	"completed",
	"history",
]);

// One label per row (see modules/metadataEnrichment/enrichment-lifecycle).
export const EnrichmentLifecycleEnum = z.enum([
	"archived",
	"stopped",
	"scheduled",
	"review",
	"no_match",
	"partial",
	"failed",
	"running",
	"done",
]);

// Shared scope for list + bulk actions: bucket, library, media type, failure
// filter and a text query.
const TrayFilter = z.object({
	bucket: EnrichmentBucketEnum.optional(),
	/** Narrows within a bucket, e.g. only "no_match" inside Attention. */
	lifecycle: EnrichmentLifecycleEnum.optional(),
	libraryUuid: z.string().uuid().optional(),
	mediaType: z.enum(["ebook", "audiobook"]).optional(),
	withFailures: z.boolean().optional(),
	query: z.string().trim().min(1).max(255).optional(),
});

export const EnrichmentSortEnum = z.enum(["recent", "oldest", "title"]);

export const ListEnrichmentInput = TrayFilter.extend({
	sort: EnrichmentSortEnum.optional(),
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).default(0),
});

// Either an explicit selection or every book matching the current filter.
// Kept as a bare shape so inputs that add fields can extend it — `.refine()`
// returns a ZodEffects, which cannot.
const targetSelectionShape = {
	bookUuids: z.array(z.string().uuid()).max(500).optional(),
	filter: TrayFilter.optional(),
};
const exactlyOneTarget = (input: { bookUuids?: unknown; filter?: unknown }) =>
	(input.bookUuids != null) !== (input.filter != null);
const TARGET_SELECTION_MESSAGE = {
	message: "Provide either bookUuids or filter",
};

const TargetSelection = z
	.object(targetSelectionShape)
	.refine(exactlyOneTarget, TARGET_SELECTION_MESSAGE);

export const RetryEnrichmentInput = z
	.object({
		...targetSelectionShape,
		/** Re-run the chain even for filled fields (refresh mode). */
		refresh: z.boolean().default(false),
	})
	.refine(exactlyOneTarget, TARGET_SELECTION_MESSAGE);

export const StopEnrichmentInput = TargetSelection;
export const ArchiveEnrichmentInput = TargetSelection;
export const UnarchiveEnrichmentInput = TargetSelection;
export const ApproveEnrichmentInput = TargetSelection;

export const ActionableCountsInput = TrayFilter;

export const ResolveProviderFailuresInput = z.object({
	libraryUuid: z.string().uuid(),
	providers: z.array(z.string().min(1).max(64)).min(1).max(20),
});

export const EnrichmentDetailInput = z.object({
	bookUuid: z.string().uuid(),
});

export const ProviderStatusInput = z.object({
	libraryUuid: z.string().uuid().optional(),
});

export type EnrichmentBucket = z.infer<typeof EnrichmentBucketEnum>;
export type ListEnrichmentFilters = z.infer<typeof ListEnrichmentInput>;
export type TargetSelectionInput = z.infer<typeof TargetSelection>;
