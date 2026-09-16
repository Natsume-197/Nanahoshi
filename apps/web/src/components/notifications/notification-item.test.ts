import { describe, expect, it } from "bun:test";
import type { NotificationData } from "@nanahoshi/api/routers/notifications/notification.model";
import {
	hasActionableAttention,
	notificationContextLabel,
	notificationSubject,
} from "./notification-item";

describe("notification presentation", () => {
	it("turns an active scan label into finished-notification context", () => {
		expect(notificationContextLabel("library-scan", "Scanning Novels")).toBe(
			"Novels",
		);
	});

	it("derives the title subject from instance task labels", () => {
		expect(notificationSubject("library-scan", "Scanning TMW Collection")).toBe(
			"TMW Collection",
		);
		expect(
			notificationSubject("library-upload", "Uploading to TMW Collection"),
		).toBe("TMW Collection");
		expect(notificationSubject("send-to-kindle", "Sending to Kindle")).toBe(
			"Kindle",
		);
		expect(
			notificationSubject("library-regroup", "Rebuilding edition groups"),
		).toBeNull();
		expect(
			notificationSubject("library-enrich", "Refreshing library metadata"),
		).toBeNull();
	});

	it("uses the whole label when it already is the subject", () => {
		expect(notificationSubject("read-listen-generation", "Dune")).toBe("Dune");
		expect(notificationSubject("read-listen-generation", "  ")).toBeNull();
	});

	it("uses fixed subjects for label-less task types", () => {
		expect(
			notificationSubject("bookmeter-sync", "Syncing Bookmeter shelves"),
		).toBe("Bookmeter");
		expect(
			notificationSubject("ranobedb-import", "Importing RanobeDB database"),
		).toBe("RanobeDB");
	});

	it("returns null when the label carries no subject", () => {
		expect(
			notificationSubject("metadata-enrich-auto", "Auto enrich metadata"),
		).toBeNull();
		expect(notificationSubject("unknown-type", "Something")).toBeNull();
	});

	it("hides attention on no-change tasks", () => {
		const base: NotificationData = {
			type: "task_finished",
			taskId: "t1",
			taskType: "library-scan",
			label: "Scanning TMW Collection",
			totalJobs: 0,
			completedJobs: 0,
			failedJobs: 0,
			attention: {
				libraryUuid: "893f13f9-7eb3-4bbf-b9d2-2bdaa9ae4719",
				noMatch: 100,
				review: 60,
				failed: 6,
			},
		};
		expect(hasActionableAttention(base)).toBe(false);
		expect(hasActionableAttention({ ...base, totalJobs: 42 })).toBe(true);
		expect(
			hasActionableAttention({ ...base, totalJobs: 42, attention: undefined }),
		).toBe(false);
	});
});
