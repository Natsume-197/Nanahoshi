import { beforeEach, describe, expect, test } from "bun:test";
import {
	addBookmark,
	findBookmarkNear,
	getBookmarksVersion,
	listBookmarks,
	removeBookmark,
	renameBookmark,
	subscribeBookmarks,
} from "./bookmarks";

const UUID = "book-uuid";

// bun:test has no DOM: install a minimal in-memory window.localStorage stub.
// The module under test only touches `window` at call time.
function installStorageStub() {
	const store = new Map<string, string>();
	const storage = {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
		clear: () => store.clear(),
	};
	(Object.assign as (t: unknown, s: unknown) => void)(globalThis, {
		window: { localStorage: storage },
	});
	return storage;
}

let storage: ReturnType<typeof installStorageStub>;
installStorageStub();

beforeEach(() => {
	storage = installStorageStub();
	storage.clear();
});

describe("audio bookmarks", () => {
	test("adds bookmarks sorted by time", () => {
		addBookmark(UUID, 300, "climax");
		addBookmark(UUID, 60, "intro");
		const bookmarks = listBookmarks(UUID);
		expect(bookmarks.map((b) => b.time)).toEqual([60, 300]);
	});

	test("renames and removes bookmarks", () => {
		const [first] = addBookmark(UUID, 60, "old");
		renameBookmark(UUID, first.id, "new");
		expect(listBookmarks(UUID)[0].label).toBe("new");
		removeBookmark(UUID, first.id);
		expect(listBookmarks(UUID)).toEqual([]);
	});

	test("returns empty list without a book", () => {
		expect(listBookmarks(null)).toEqual([]);
	});

	test("notifies subscribers on every mutation", () => {
		let calls = 0;
		const unsubscribe = subscribeBookmarks(() => {
			calls += 1;
		});
		const versionBefore = getBookmarksVersion();
		const [first] = addBookmark(UUID, 60, "a");
		renameBookmark(UUID, first.id, "b");
		removeBookmark(UUID, first.id);
		unsubscribe();
		addBookmark(UUID, 60, "c");
		expect(calls).toBe(3);
		expect(getBookmarksVersion()).toBe(versionBefore + 4);
	});

	test("finds the nearest bookmark within the hover threshold", () => {
		addBookmark(UUID, 60, "intro");
		addBookmark(UUID, 300, "climax");
		const bookmarks = listBookmarks(UUID);
		expect(findBookmarkNear(bookmarks, 62, 5)?.label).toBe("intro");
		expect(findBookmarkNear(bookmarks, 200, 5)).toBeNull();
		// Closest wins when several are in range.
		expect(findBookmarkNear(bookmarks, 200, 150)?.label).toBe("climax");
	});
});
