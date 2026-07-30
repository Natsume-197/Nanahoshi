import { describe, expect, test } from "bun:test";
import {
	getActiveProviderPositions,
	getUploadableLibraries,
	hasEnabledLibraryPath,
	permissionMapsEqual,
	resolveUploadTargetLibrary,
	resolveUploadTargetPathId,
} from "../library-ui-state";

describe("library UI state", () => {
	test("offers only libraries an upload can land in", () => {
		const libraries = [
			{ id: 1, name: "Books", mediaType: "ebook", paths: [{ id: 10 }] },
			{
				id: 2,
				name: "Audiobooks",
				mediaType: "audiobook",
				paths: [{ id: 20 }],
			},
			{ id: 3, name: "No folders", mediaType: "ebook", paths: [] },
			{
				id: 4,
				name: "All folders disabled",
				mediaType: "ebook",
				paths: [{ id: 40, isEnabled: false }],
			},
			{ id: 5, name: "No paths field", mediaType: "ebook" },
		];

		expect(getUploadableLibraries(libraries).map((lib) => lib.id)).toEqual([1]);
	});

	test("treats a path with an unset isEnabled as enabled", () => {
		const libraries = [
			{
				id: 1,
				mediaType: "ebook",
				paths: [{ id: 10, isEnabled: false }, { id: 11 }],
			},
		];

		expect(getUploadableLibraries(libraries)).toHaveLength(1);
	});

	test("distinguishes a ready library from one that still needs a folder", () => {
		expect(hasEnabledLibraryPath({ paths: [{ isEnabled: true }] })).toBe(true);
		expect(hasEnabledLibraryPath({ paths: [{}] })).toBe(true);
		expect(hasEnabledLibraryPath({ paths: [{ isEnabled: false }] })).toBe(
			false,
		);
		expect(hasEnabledLibraryPath({ paths: [] })).toBe(false);
	});

	test("defaults the upload target to a library that has an enabled folder", () => {
		const libraries = [
			{ id: 1, paths: [{ id: 10, isEnabled: false }] },
			{ id: 2, paths: [{ id: 20 }] },
		];

		expect(resolveUploadTargetLibrary(libraries, null)?.id).toBe(2);
		// An explicit choice wins, even over the smarter default.
		expect(resolveUploadTargetLibrary(libraries, 1)?.id).toBe(1);
		expect(resolveUploadTargetLibrary([], null)).toBeNull();
	});

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
