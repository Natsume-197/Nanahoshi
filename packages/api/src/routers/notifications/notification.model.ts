import { z } from "zod";

/** Actor snapshot stored in the payload at emit time (renames don't retro-update). */
export const ActorRef = z.object({
	id: z.string(),
	name: z.string(),
	username: z.string().nullable(),
	displayUsername: z.string().nullable(),
});
export type ActorRef = z.infer<typeof ActorRef>;

export const NotificationData = z.discriminatedUnion("type", [
	z.object({ type: z.literal("follow"), actor: ActorRef }),
	z.object({ type: z.literal("follow_back"), actor: ActorRef }),
	z.object({
		type: z.literal("activity_like"),
		actor: ActorRef,
		activityId: z.number(),
		bookTitle: z.string().nullable(),
	}),
	z.object({
		type: z.literal("activity_comment"),
		actor: ActorRef,
		activityId: z.number(),
		commentId: z.number(),
		bookTitle: z.string().nullable(),
		excerpt: z.string(),
	}),
	z.object({
		type: z.literal("task_finished"),
		taskId: z.string(),
		taskType: z.string(),
		label: z.string(),
		totalJobs: z.number(),
		completedJobs: z.number(),
		failedJobs: z.number(),
	}),
]);
export type NotificationData = z.infer<typeof NotificationData>;
export type NotificationType = NotificationData["type"];

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
