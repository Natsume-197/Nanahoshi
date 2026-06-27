import { describe, expect, it } from "bun:test";
import { resolveInitialBookmark } from "../resolve-bookmark";
import type { ReaderBookmark } from "../types";

function local(
	exploredCharCount: number,
	lastBookmarkModified: number,
): ReaderBookmark {
	return {
		exploredCharCount,
		progress: 0,
		scrollY: 1234,
		lastBookmarkModified,
	};
}

describe("resolveInitialBookmark", () => {
	it("returns undefined when neither side exists", () => {
		expect(
			resolveInitialBookmark(undefined, {
				exploredCharCount: 0,
				modifiedAt: 0,
			}),
		).toBeUndefined();
	});

	it("returns the local bookmark when only local exists", () => {
		const b = local(500, 1000);
		expect(
			resolveInitialBookmark(b, { exploredCharCount: 0, modifiedAt: 0 }),
		).toBe(b);
	});

	it("builds a server bookmark when only server progress exists", () => {
		const result = resolveInitialBookmark(undefined, {
			exploredCharCount: 800,
			modifiedAt: 5000,
		});
		expect(result?.exploredCharCount).toBe(800);
		// server copy carries the count only, no pixel scroll offset
		expect(result?.scrollY).toBeUndefined();
	});

	it("treats server progress of 0 char count as absent", () => {
		const b = local(500, 1000);
		expect(
			resolveInitialBookmark(b, { exploredCharCount: 0, modifiedAt: 9999 }),
		).toBe(b);
	});

	it("prefers local at equal char counts (it has the pixel offset)", () => {
		const b = local(700, 1000);
		const result = resolveInitialBookmark(b, {
			exploredCharCount: 700,
			modifiedAt: 9999, // newer, but counts are equal -> local wins
		});
		expect(result).toBe(b);
		expect(result?.scrollY).toBe(1234);
	});

	it("prefers local when it is newer", () => {
		const b = local(500, 9000);
		const result = resolveInitialBookmark(b, {
			exploredCharCount: 900,
			modifiedAt: 1000,
		});
		expect(result).toBe(b);
	});

	it("prefers server when it is strictly newer and counts differ", () => {
		const b = local(500, 1000);
		const result = resolveInitialBookmark(b, {
			exploredCharCount: 900,
			modifiedAt: 9000,
		});
		expect(result?.exploredCharCount).toBe(900);
		expect(result?.scrollY).toBeUndefined();
	});
});
