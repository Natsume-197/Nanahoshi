import { getUsersWithLibraryAccess } from "../../auth/access.repository";
import { logger } from "../../lib/logger";
import type { Task } from "../../modules/taskManager";
import { enrichmentStateRepository } from "../enrichment/enrichment.repository";
import { libraryRepository } from "../libraries/library.repository";
import { publishNotificationEvent } from "./notification.events";
import type {
	EnrichmentAttention,
	NotificationData,
} from "./notification.model";
import { notificationRepository } from "./notification.repository";

const log = logger.child({ component: "notifications" });

// Library tasks whose finish should surface an enrichment attention summary
// (books that ended up no_match / review / failed) with a match-manager link.
const ATTENTION_TASK_TYPES = new Set([
	"library-scan",
	"library-enrich",
	"library-reprocess",
]);

// Resolve the review/no-match/failure summary for a finished library task.
// Returns undefined when nothing needs attention, so the notification stays
// a plain "finished" without a call to action.
async function resolveAttention(
	task: Task,
): Promise<EnrichmentAttention | undefined> {
	if (!ATTENTION_TASK_TYPES.has(task.type) || !task.libraryId) return undefined;
	try {
		const [counts, uuid] = await Promise.all([
			enrichmentStateRepository.attentionCountsForLibrary(task.libraryId),
			libraryRepository.getUuidById(task.libraryId),
		]);
		if (!uuid) return undefined;
		if (counts.noMatch === 0 && counts.review === 0 && counts.failed === 0) {
			return undefined;
		}
		return { libraryUuid: uuid, ...counts };
	} catch (err) {
		log.error({ err, taskId: task.id }, "attention summary failed");
		return undefined;
	}
}

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

export const deleteAllNotifications = async (userId: string) => {
	await notificationRepository.deleteAllForUser(userId);
	publishNotificationEvent(userId, { kind: "delete_all" });
};

export const emitTaskFinished = async (task: Task) => {
	const attention = await resolveAttention(task);
	const data: NotificationData = {
		type: "task_finished",
		taskId: task.id,
		taskType: task.type,
		label: task.label,
		totalJobs: task.totalJobs,
		completedJobs: task.completedJobs,
		failedJobs: task.failedJobs,
		...(task.failureReason && { error: task.failureReason }),
		...(attention && { attention }),
	};

	if (task.type === "library-scan") {
		if (!task.libraryId || !task.serverId) return;
		// Manual maintenance is personal, even when other people can administer
		// the library. Scheduled scans have no initiator and fan out only to users
		// who may act on their result.
		if (task.userId) {
			await dispatch(task.userId, data);
			return;
		}
		// Avoid noise from a scheduled scan that found no work.
		if (task.totalJobs <= 0) return;
		const userIds = await getUsersWithLibraryAccess(
			task.libraryId,
			task.serverId,
			"scan",
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
