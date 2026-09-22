import { describe, expect, it } from "bun:test";
import { primaryActionForLifecycle } from "./primary-action";

describe("primaryActionForLifecycle", () => {
	it.each([
		["review", "approve"],
		["partial", "fix"],
		["unresolved", "fix"],
		["no_match", "fix"],
		["scheduled", "retry"],
		["failed", "retry"],
		["running", "details"],
		["done", "details"],
	] as const)("maps %s to %s", (lifecycle, action) => {
		expect(primaryActionForLifecycle(lifecycle)).toBe(action);
	});
});
