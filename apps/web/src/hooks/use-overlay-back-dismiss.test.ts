import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createOverlayBackStack } from "./use-overlay-back-dismiss";

const notifications = readFileSync(
	new URL("../components/notifications/notification-bell.tsx", import.meta.url),
	"utf8",
);
const miniPlayer = readFileSync(
	new URL("../components/audio-player/mini-player.tsx", import.meta.url),
	"utf8",
);

describe("overlay back dismissal", () => {
	it("lets the topmost overlay consume back before the page", () => {
		const stack = createOverlayBackStack();
		stack.add("player");
		stack.add("notifications");

		expect(stack.consume("BACK", "player")).toBe(false);
		expect(stack.consume("BACK", "notifications")).toBe(true);
		expect(stack.consume("BACK", "player")).toBe(true);
	});

	it("does not consume forward or programmatic navigation", () => {
		const stack = createOverlayBackStack();
		stack.add("notifications");

		expect(stack.consume("PUSH", "notifications")).toBe(false);
		expect(stack.consume("REPLACE", "notifications")).toBe(false);
		expect(stack.consume("FORWARD", "notifications")).toBe(false);
	});

	it("connects notifications and the expanded player to browser back", () => {
		expect(notifications).toContain("useOverlayBackDismiss(open");
		expect(miniPlayer).toContain("useOverlayBackDismiss(isExpanded");
	});
});
