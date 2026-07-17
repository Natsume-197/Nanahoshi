import { describe, expect, test } from "bun:test";
import {
	getActiveProviderPositions,
	permissionMapsEqual,
	resolveUploadTargetPathId,
} from "../library-ui-state";

describe("library UI state", () => {
	test("selects the first enabled upload path when none was previously available", () => {
		expect(resolveUploadTargetPathId([{ id: 7 }], null)).toBe(7);
	});

	test("keeps a valid upload path and replaces a removed one", () => {
		const paths = [{ id: 3 }, { id: 9 }];
		expect(resolveUploadTargetPathId(paths, 9)).toBe(9);
		expect(resolveUploadTargetPathId(paths, 12)).toBe(3);
		expect(resolveUploadTargetPathId([], 3)).toBeNull();
	});

	test("numbers only enabled metadata providers", () => {
		const positions = getActiveProviderPositions([
			{ id: "disabled-first", enabled: false },
			{ id: "primary", enabled: true },
			{ id: "secondary", enabled: true },
		]);

		expect(positions.get("disabled-first")).toBeUndefined();
		expect(positions.get("primary")).toBe(1);
		expect(positions.get("secondary")).toBe(2);
	});

	test("compares permission drafts without depending on key or action order", () => {
		expect(
			permissionMapsEqual(
				{ book: ["download", "read"], library: ["view"] },
				{ library: ["view"], book: ["read", "download"] },
			),
		).toBe(true);
		expect(
			permissionMapsEqual({ book: ["read"] }, { book: ["download"] }),
		).toBe(false);
	});
});
