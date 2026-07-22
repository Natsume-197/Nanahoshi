import { z } from "zod";

export const NotificationData = z.object({
	type: z.literal("task_finished"),
	taskId: z.string(),
	taskType: z.string(),
	label: z.string(),
	totalJobs: z.number(),
	completedJobs: z.number(),
	failedJobs: z.number(),
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
