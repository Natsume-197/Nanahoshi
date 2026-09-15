import { describe, expect, it } from "bun:test";
import { notificationContextLabel } from "./notification-item";

describe("notification presentation", () => {
	it("turns an active scan label into finished-notification context", () => {
		expect(notificationContextLabel("library-scan", "Scanning Novels")).toBe(
			"Novels",
		);
	});
});
