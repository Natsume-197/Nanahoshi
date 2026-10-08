import { expect, test } from "bun:test";
import { mayShowTitles } from "./title-invalidation";

const orpc = (...path: string[]) => ({
	queryKey: [path, { type: "query", input: {} }],
});

test("lists, rails, search and the title's page refresh", () => {
	expect(mayShowTitles(orpc("books", "listRecent"))).toBe(true);
	expect(mayShowTitles(orpc("audiobooks", "getDetails"))).toBe(true);
	expect(mayShowTitles(orpc("search", "top"))).toBe(true);
	expect(mayShowTitles(orpc("readingProgress", "listInProgress"))).toBe(true);
});

test("what never shows a title is left alone", () => {
	expect(mayShowTitles(orpc("notifications", "unreadCount"))).toBe(false);
	expect(mayShowTitles(orpc("profile", "getProfile"))).toBe(false);
});

test("hand-keyed queries (reader page, tab icons, book files) are skipped", () => {
	expect(mayShowTitles({ queryKey: ["reader-page"] })).toBe(false);
	expect(mayShowTitles({ queryKey: ["tab-icon", "home", "#fff", true] })).toBe(
		false,
	);
});
