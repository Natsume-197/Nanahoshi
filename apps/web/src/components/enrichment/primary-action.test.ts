import { describe, expect, it } from "bun:test";
import {
	primaryActionForLifecycle,
	secondaryActionsForLifecycle,
} from "./primary-action";

describe("primaryActionForLifecycle", () => {
	it.each([
		["review", "approve"],
		["partial", "fix"],
		["unresolved", "choose"],
		["no_match", "fix"],
		["scheduled", "retry"],
		["failed", "retry"],
		["running", "details"],
		["done", "details"],
	] as const)("maps %s to %s", (lifecycle, action) => {
		expect(primaryActionForLifecycle(lifecycle)).toBe(action);
	});
});

describe("secondaryActionsForLifecycle", () => {
	it.each([
		["review", ["fix", "retry"]],
		["partial", ["retry"]],
		["unresolved", ["fix", "retry"]],
		["no_match", ["retry"]],
		["scheduled", ["cancelRetry"]],
		["failed", ["fix"]],
		["running", []],
		["done", ["fix", "retry"]],
	] as const)("offers %s → %p", (lifecycle, actions) => {
		expect(secondaryActionsForLifecycle(lifecycle)).toEqual([...actions]);
	});

	it("never repeats the row's primary action", () => {
		for (const lifecycle of [
			"review",
			"partial",
			"unresolved",
			"no_match",
			"scheduled",
			"failed",
			"running",
			"done",
		] as const) {
			expect(secondaryActionsForLifecycle(lifecycle)).not.toContain(
				primaryActionForLifecycle(lifecycle),
			);
		}
	});
});
