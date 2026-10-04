import { describe, expect, test } from "bun:test";
import type { AudioBookmark } from "./bookmarks-model";
import { seekPreview } from "./seek-preview";

const chapters = [
	{ index: 0, title: "One", startTime: 0, endTime: 600 },
	{ index: 1, title: "Two", startTime: 600, endTime: 1200 },
];
const mark = (id: string, time: number, label = ""): AudioBookmark => ({
	id,
	time,
	label,
	createdAt: 1,
});

describe("seekPreview", () => {
	test("names the chapter under the finger", () => {
		expect(seekPreview(700, 1200, chapters, []).chapterIndex).toBe(1);
	});

	test("claims a bookmark within reach, numbered as in the list", () => {
		const list = [mark("a", 100), mark("b", 800, "Plot twist")];
		// 1.5% of 1200 s = 18 s
		expect(seekPreview(815, 1200, chapters, list).bookmark).toEqual({
			id: "b",
			number: 2,
			label: "Plot twist",
		});
		expect(seekPreview(830, 1200, chapters, list).bookmark).toBeNull();
	});

	test("reach scales with the bar, so a chapter-scoped bar stays precise", () => {
		const list = [mark("a", 100)];
		expect(seekPreview(110, 120, chapters, list).bookmark).toBeNull();
		expect(seekPreview(110, 36_000, chapters, list).bookmark?.id).toBe("a");
	});
});
