import { describe, expect, test } from "bun:test";
import {
	READER_POSITION_VERSION,
	type ReaderPosition,
} from "@/features/reader/document/types";
import { resolveReadingPosition } from "./reader-position";

const local = (overrides: Partial<ReaderPosition> = {}): ReaderPosition => ({
	exploredCharCount: 34,
	progress: 0.34,
	modifiedAt: 340,
	positionVersion: READER_POSITION_VERSION,
	locator: { sectionReference: "chapter-2", characterOffset: 4 },
	...overrides,
});

describe("resolve reading position", () => {
	test("orders cross-device positions by intent time, not response timing", () => {
		const result = resolveReadingPosition(local(), {
			exploredCharCount: 72,
			bookCharCount: 100,
			// This is the server's accepted positionIntentAt. It intentionally
			// predates the local session even if its HTTP response arrived later.
			modifiedAt: 200,
		});

		expect(result).toMatchObject({
			exploredCharCount: 34,
			locator: { sectionReference: "chapter-2", characterOffset: 4 },
		});
	});

	test("selects a genuinely newer remote intent", () => {
		expect(
			resolveReadingPosition(local(), {
				exploredCharCount: 72,
				bookCharCount: 100,
				modifiedAt: 720,
			}),
		).toMatchObject({ exploredCharCount: 72, progress: 0.72 });
	});

	test("keeps the exact local locator on an equal position", () => {
		expect(
			resolveReadingPosition(local(), {
				exploredCharCount: 34,
				bookCharCount: 100,
				modifiedAt: 999,
			}),
		).toEqual(local());
	});
});
