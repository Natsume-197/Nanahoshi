import { expect, test } from "bun:test";
import {
	bookmarkLines,
	findBookmarkNear,
	MAX_BOOKMARKS,
	newBookmark,
	parseBookmarks,
	withBookmark,
} from "./bookmarks-model";

test("reads bookmarks from disk in book order, dropping broken ones", () => {
	const list = parseBookmarks(
		[
			{ id: "b", time: 90, label: "later", createdAt: 2 },
			{ id: "a", time: 10, label: "x".repeat(200), createdAt: 1 },
			{ id: 3, time: 5, label: "no id" },
			"junk",
		],
		99,
	);
	expect(list.map((bookmark) => bookmark.id)).toEqual(["a", "b"]);
	expect(list[0].label).toHaveLength(140);
	expect(parseBookmarks({ not: "a list" })).toEqual([]);
});

test("a new bookmark lands in order and the oldest positions give way at the cap", () => {
	const full = Array.from({ length: MAX_BOOKMARKS }, (_, index) =>
		newBookmark(index + 1, `b${index}`, 0),
	);
	const next = withBookmark(full, newBookmark(500.7, "new", 0));
	expect(next).toHaveLength(MAX_BOOKMARKS);
	expect(next.at(-1)).toMatchObject({ id: "new", time: 500 });
	expect(next[0].id).toBe("b1");
});

test("finds the closest bookmark within the threshold", () => {
	const list = [newBookmark(100, "a", 0), newBookmark(110, "b", 0)];
	expect(findBookmarkNear(list, 108, 5)?.id).toBe("b");
	expect(findBookmarkNear(list, 200, 5)).toBeNull();
});

test("a repeated tap on the same second saves one bookmark", () => {
	const once = withBookmark([], newBookmark(36.4, "a", 1));
	const twice = withBookmark(once, newBookmark(36.9, "b", 2));
	expect(twice.map((bookmark) => bookmark.id)).toEqual(["a"]);
	expect(withBookmark(twice, newBookmark(37, "c", 3))).toHaveLength(2);
});

test("a bookmark row names its note, else its chapter, without repeating the chapter", () => {
	const at = (label: string) => ({ ...newBookmark(60, "a", 0), label });
	expect(bookmarkLines(at("Plot twist"), "Chapter 3", "1:00")).toEqual({
		title: "Plot twist",
		chapter: "Chapter 3",
	});
	expect(bookmarkLines(at("Chapter 3"), "Chapter 3", "1:00")).toEqual({
		title: "Chapter 3",
		chapter: null,
	});
	expect(bookmarkLines(at(""), "Chapter 3", "1:00")).toEqual({
		title: "Chapter 3",
		chapter: null,
	});
	expect(bookmarkLines(at(""), null, "1:00").title).toBe("1:00");
});
