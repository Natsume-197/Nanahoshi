import { getUsersWithLibraryAccess } from "../../auth/access.repository";
import { logger } from "../../lib/logger";
import type { Task } from "../../modules/taskManager";
import { publishNotificationEvent } from "./notification.events";
import type { NotificationData } from "./notification.model";
import { notificationRepository } from "./notification.repository";

const log = logger.child({ component: "notifications" });

// Library tasks notify everyone who can view the library; the rest are
// personal and go to whoever started the task.
const LIBRARY_AUDIENCE_TASK_TYPES = new Set(["library-scan", "library-upload"]);

// Persist + push in-app. Single delivery seam: future channels (email digest,
// web push) hook in here, after the insert.
export const dispatch = async (userId: string, data: NotificationData) => {
	const row = await notificationRepository.insertAndPrune(userId, data);
	publishNotificationEvent(userId, { kind: "new", notification: row });
};

// Read/delete mutations publish so the user's other tabs converge instantly.
export const markAllRead = async (userId: string) => {
	await notificationRepository.markAllRead(userId);
	publishNotificationEvent(userId, { kind: "read_all" });
};

export const markRead = async (userId: string, ids: number[]) => {
	await notificationRepository.markRead(userId, ids);
	publishNotificationEvent(userId, { kind: "read", ids });
};

export const deleteNotification = async (userId: string, id: number) => {
	await notificationRepository.deleteById(userId, id);
	publishNotificationEvent(userId, { kind: "delete", id });
};

export const emitTaskFinished = async (task: Task) => {
	const data: NotificationData = {
		type: "task_finished",
		taskId: task.id,
		taskType: task.type,
		label: task.label,
		totalJobs: task.totalJobs,
		completedJobs: task.completedJobs,
		failedJobs: task.failedJobs,
	};

	if (LIBRARY_AUDIENCE_TASK_TYPES.has(task.type)) {
		if (!task.libraryId || !task.serverId) return;
		// No changes → no audience noise (a nightly scheduled scan that found
		// nothing would otherwise notify everyone every night). But whoever ran
		// it manually still wants to know it finished clean.
		if (task.totalJobs <= 0) {
			if (task.userId) await dispatch(task.userId, data);
			return;
		}
		const userIds = await getUsersWithLibraryAccess(
			task.libraryId,
			task.serverId,
		);
		await Promise.all(
			userIds.map((userId) =>
				dispatch(userId, data).catch((err) =>
					log.error({ err, userId, taskId: task.id }, "notify dispatch failed"),
				),
			),
		);
		return;
	}

	if (!task.userId) return;
	// A scan's enrich child can seal empty (race with scan finish); "0 books
	// enriched" is noise.
	if (task.type === "metadata-enrich-auto" && task.totalJobs <= 0) return;
	await dispatch(task.userId, data);
};
