import { z } from "zod";

// Enrichment/scan attention summary attached to library task notifications so
// the item can deep-link to the match manager pre-filtered.
export const EnrichmentAttention = z.object({
	libraryUuid: z.string(),
	noMatch: z.number(),
	review: z.number(),
	failed: z.number(),
});
export type EnrichmentAttention = z.infer<typeof EnrichmentAttention>;

export const NotificationData = z.object({
	type: z.literal("task_finished"),
	taskId: z.string(),
	taskType: z.string(),
	label: z.string(),
	totalJobs: z.number(),
	completedJobs: z.number(),
	failedJobs: z.number(),
	error: z.string().max(2_000).optional(),
	// Present only for enrichment-producing library tasks with items to review.
	attention: EnrichmentAttention.optional(),
});
export type NotificationData = z.infer<typeof NotificationData>;

export const ListNotificationsInput = z.object({
	limit: z.number().int().min(1).max(50).default(20),
	/** Exclusive keyset cursor: the id of the last row already seen. */
	cursor: z.number().optional(),
});

export const MarkReadInput = z.object({
	ids: z.array(z.number()).min(1).max(100),
});

export const DeleteNotificationInput = z.object({
	id: z.number(),
});
