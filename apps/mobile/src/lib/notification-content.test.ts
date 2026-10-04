import { expect, test } from "bun:test";
import type { NotificationData } from "@nanahoshi/api/routers/notifications/notification.model";
import { notificationContent } from "./notification-content";

// Echo the key and params so the test reads which message was chosen.
const t = (key: string, params?: Record<string, string | number>) =>
	params ? `${key}(${Object.values(params).join(",")})` : key;

const scan = (over: Partial<NotificationData>): NotificationData => ({
	type: "task_finished",
	taskId: "1",
	taskType: "library-scan",
	label: "Scanning TMW Collection",
	totalJobs: 10,
	completedJobs: 10,
	failedJobs: 0,
	...over,
});

test("a named task reads as a sentence about its subject, not the worker label", () => {
	const content = notificationContent(scan({}), t);
	expect(content.title).toBe(
		"notifications.task_library_scan_sentence(TMW Collection)",
	);
	expect(content.detail).toBe("notifications.task_processed(10)");
	expect(content.failed).toBe(false);
});

test("a scan that found nothing says the library is up to date", () => {
	const content = notificationContent(
		scan({ totalJobs: 0, completedJobs: 0 }),
		t,
	);
	expect(content.title).toBe(
		"notifications.task_no_changes_sentence(TMW Collection)",
	);
	expect(content.detail).toBeNull();
});

test("an all-failed task is marked failed and counts the failures", () => {
	const content = notificationContent(
		scan({ completedJobs: 0, failedJobs: 3 }),
		t,
	);
	expect(content.failed).toBe(true);
	expect(content.detail).toBe(
		"notifications.task_processed(0) · notifications.task_failed(3)",
	);
});

test("a label without a name falls back to the plain title", () => {
	const content = notificationContent(
		scan({ taskType: "recommendations-rebuild", label: "Rebuild" }),
		t,
	);
	expect(content.title).toBe("notifications.task_recommendations_rebuild");
});
