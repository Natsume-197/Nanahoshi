import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import {
	getDefaultHomeLayout,
	HOME_LAYOUT_STORAGE_KEY,
	normalizeHomeLayout,
	setHomeLayout,
} from "../home-layout-store";

afterEach(() => {
	setHomeLayout(getDefaultHomeLayout());
	window.localStorage.removeItem(HOME_LAYOUT_STORAGE_KEY);
});

describe("home layout preferences", () => {
	it("starts with the complete unified dashboard order", () => {
		expect(normalizeHomeLayout(null)).toEqual(getDefaultHomeLayout());
	});

	it("migrates the former scoped layout while repairing stale data", () => {
		const layout = normalizeHomeLayout({
			all: [
				{ id: "popular-books", visible: false },
				{ id: "stale-section", visible: true },
				{ id: "recent-audiobooks", visible: true },
				{ id: "popular-audiobooks", visible: true },
			],
		});

		expect(layout.slice(0, 2)).toEqual([
			{ id: "popular", visible: false },
			{ id: "recently-added", visible: true },
		]);
		expect(layout).toHaveLength(getDefaultHomeLayout().length);
		expect(layout.some((item) => String(item.id) === "stale-section")).toBe(
			false,
		);
	});

	it("persists one unified order and visibility configuration", () => {
		const current = getDefaultHomeLayout();
		const next = [
			{ ...current[1], visible: false },
			current[0],
			...current.slice(2),
		];

		setHomeLayout(next);

		expect(
			JSON.parse(window.localStorage.getItem(HOME_LAYOUT_STORAGE_KEY) ?? "[]"),
		).toEqual(next);
	});
});
