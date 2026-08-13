import { describe, expect, it } from "bun:test";
import {
	notificationContextLabel,
	notificationRowClassName,
} from "./notification-item";

describe("notification presentation", () => {
	it("turns an active scan label into finished-notification context", () => {
		expect(notificationContextLabel("library-scan", "Scanning Novels")).toBe(
			"Novels",
		);
	});

	it("gives unread actionable rows a visible hover change", () => {
		const classes = notificationRowClassName(true, true).split(" ");
		expect(classes).toContain("bg-muted/40");
		expect(classes).toContain("hover:bg-muted");
	});
});
