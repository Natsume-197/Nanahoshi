import { describe, expect, test } from "bun:test";
import { resolveInitialBookmark } from "./resolve-bookmark";
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
