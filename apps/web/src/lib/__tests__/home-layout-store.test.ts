import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import {
	getDefaultHomeLayout,
	HOME_LAYOUT_STORAGE_KEY,
	normalizeHomeLayouts,
	setHomeLayout,
} from "../home-layout-store";

afterEach(() => {
	setHomeLayout("all", getDefaultHomeLayout("all"));
	setHomeLayout("books", getDefaultHomeLayout("books"));
	setHomeLayout("audiobooks", getDefaultHomeLayout("audiobooks"));
	window.localStorage.removeItem(HOME_LAYOUT_STORAGE_KEY);
});

describe("home layout preferences", () => {
	it("starts every view with its complete default order", () => {
		const layouts = normalizeHomeLayouts(null);

		expect(layouts.books).toEqual(getDefaultHomeLayout("books"));
		expect(layouts.audiobooks).toEqual(getDefaultHomeLayout("audiobooks"));
		expect(layouts.all).toEqual(getDefaultHomeLayout("all"));
	});

	it("keeps saved order and visibility while repairing stale data", () => {
		const layouts = normalizeHomeLayouts({
			books: [
				{ id: "random-books", visible: false },
				{ id: "stale-section", visible: true },
				{ id: "continue-reading", visible: true },
				{ id: "random-books", visible: true },
			],
		});

		expect(layouts.books.slice(0, 2)).toEqual([
			{ id: "random-books", visible: false },
			{ id: "continue-reading", visible: true },
		]);
		expect(layouts.books).toHaveLength(getDefaultHomeLayout("books").length);
		expect(layouts.books.some((item) => item.id === "stale-section")).toBe(
			false,
		);
	});

	it("persists one view without changing the others", () => {
		const books = getDefaultHomeLayout("books");
		const nextBooks = [
			{ ...books[1], visible: false },
			books[0],
			...books.slice(2),
		];

		setHomeLayout("books", nextBooks);

		const stored = JSON.parse(
			window.localStorage.getItem(HOME_LAYOUT_STORAGE_KEY) ?? "{}",
		);
		expect(stored.books).toEqual(nextBooks);
		expect(stored.all).toEqual(getDefaultHomeLayout("all"));
		expect(stored.audiobooks).toEqual(getDefaultHomeLayout("audiobooks"));
	});
});
