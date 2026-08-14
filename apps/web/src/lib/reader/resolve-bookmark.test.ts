import { describe, expect, test } from "bun:test";
import {
	resolveInitialBookmark,
	resolveReaderResumePosition,
} from "./resolve-bookmark";
import { READER_POSITION_VERSION } from "./types";

describe("reader bookmark coordinate migration", () => {
	test("migrates an old local bookmark by its stored progress ratio", () => {
		const migrated = resolveInitialBookmark(
			{
				exploredCharCount: 250,
				progress: 0.25,
				scrollY: 8_000,
				lastBookmarkModified: 20,
			},
			{ exploredCharCount: 0, bookCharCount: 0, modifiedAt: 0 },
			2_000,
		);

		expect(migrated).toEqual({
			exploredCharCount: 500,
			progress: 0.25,
			lastBookmarkModified: 20,
			positionVersion: READER_POSITION_VERSION,
		});
	});

	test("migrates server progress using its previous book total", () => {
		const migrated = resolveInitialBookmark(
			undefined,
			{ exploredCharCount: 300, bookCharCount: 1_000, modifiedAt: 10 },
			2_000,
		);

		expect(migrated?.exploredCharCount).toBe(600);
		expect(migrated?.progress).toBe(0.3);
	});
});

describe("reader resume mode", () => {
	const manualBookmark = {
		exploredCharCount: 200,
		progress: 0.2,
		lastBookmarkModified: 10,
		positionVersion: READER_POSITION_VERSION,
	};
	const automaticPosition = {
		exploredCharCount: 700,
		progress: 0.7,
		lastBookmarkModified: 30,
		positionVersion: READER_POSITION_VERSION,
	};
	const serverProgress = {
		exploredCharCount: 800,
		bookCharCount: 1_000,
		modifiedAt: 40,
		positionMode: "automatic" as const,
	};

	test("bookmark mode restores the marker even when automatic progress is newer", () => {
		expect(
			resolveReaderResumePosition({
				mode: "bookmark",
				manualBookmark,
				automaticPosition,
				serverProgress,
				currentBookCharCount: 1_000,
			}),
		).toEqual(manualBookmark);
	});

	test("automatic mode restores the newest automatic or server position", () => {
		expect(
			resolveReaderResumePosition({
				mode: "automatic",
				manualBookmark,
				automaticPosition,
				serverProgress,
				currentBookCharCount: 1_000,
			})?.exploredCharCount,
		).toBe(800);
	});

	test("bookmark mode ignores an automatic server position when no marker exists", () => {
		expect(
			resolveReaderResumePosition({
				mode: "bookmark",
				manualBookmark: undefined,
				automaticPosition,
				serverProgress,
				currentBookCharCount: 1_000,
			}),
		).toBeUndefined();
	});

	test("bookmark mode accepts a newer server marker from another device", () => {
		expect(
			resolveReaderResumePosition({
				mode: "bookmark",
				manualBookmark,
				automaticPosition,
				serverProgress: { ...serverProgress, positionMode: "bookmark" },
				currentBookCharCount: 1_000,
			})?.exploredCharCount,
		).toBe(800);
	});

	test("automatic mode ignores server markers, including legacy rows", () => {
		for (const positionMode of ["bookmark" as const, null]) {
			expect(
				resolveReaderResumePosition({
					mode: "automatic",
					manualBookmark,
					automaticPosition,
					serverProgress: { ...serverProgress, positionMode },
					currentBookCharCount: 1_000,
				}),
			).toEqual(automaticPosition);
		}
	});
});
