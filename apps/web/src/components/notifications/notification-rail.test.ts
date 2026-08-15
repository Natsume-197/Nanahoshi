import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const notifications = readFileSync(
	new URL("./notification-bell.tsx", import.meta.url),
	"utf8",
);
const layout = readFileSync(
	new URL("../layout/dashboard-layout.tsx", import.meta.url),
	"utf8",
);

describe("notification rail", () => {
	it("uses a responsive side rail instead of a desktop popover", () => {
		expect(notifications).toContain("export function NotificationRail");
		expect(notifications).toContain('mode="rail"');
		expect(notifications).toContain(
			'className={cn(\n\t\t\t\t\t"theme-gradient-surface absolute',
		);
		expect(notifications).not.toContain("PopoverContent");
	});

	it("keeps the full-screen sheet below the rail breakpoint", () => {
		expect(notifications).toContain("useActivityRailIsSheet()");
		expect(notifications).toContain('className="mobile-screen-sheet inset-0');
		expect(notifications).toContain("useOverlayBackDismiss(open && isSheet");
	});

	it("mounts beside the friends rail and keeps the panels mutually exclusive", () => {
		expect(layout).toContain("<NotificationRail");
		expect(layout).toContain("setNotificationRailOpen(false)");
		expect(layout).toContain("if (open) setActivityRailOpen(false)");
	});
});
