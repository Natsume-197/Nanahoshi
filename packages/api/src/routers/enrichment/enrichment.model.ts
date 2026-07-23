import { z } from "zod";

export const EnrichmentStatusEnum = z.enum([
	"pending",
	"enriched",
	"partial",
	"no_match",
	"review",
]);

export const ListEnrichmentInput = z.object({
	status: EnrichmentStatusEnum.optional(),
	/** Only books whose last run had at least one failure. */
	withFailures: z.boolean().optional(),
	libraryUuid: z.string().uuid().optional(),
	query: z.string().trim().min(1).max(255).optional(),
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).default(0),
});

export const RetryEnrichmentInput = z.object({
	/** Explicit selection… */
	bookUuids: z.array(z.string().uuid()).max(500).optional(),
	/** …or every retryable book matching the filter. */
	filter: z
		.object({
			status: EnrichmentStatusEnum.optional(),
			libraryUuid: z.string().uuid().optional(),
		})
		.optional(),
	/** Re-run the chain even for filled fields (refresh mode). */
	refresh: z.boolean().default(false),
});

export const EnrichmentDetailInput = z.object({
	bookUuid: z.string().uuid(),
});

export const ApproveEnrichmentInput = z.object({
	bookUuids: z.array(z.string().uuid()).min(1).max(500),
});

export type ListEnrichmentFilters = z.infer<typeof ListEnrichmentInput>;
