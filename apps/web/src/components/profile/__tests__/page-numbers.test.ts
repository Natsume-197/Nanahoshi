import { describe, expect, it } from "bun:test";
import { generatePageNumbers } from "../page-numbers";

const pages = (current: number, total: number) =>
	generatePageNumbers(current, total).map((entry) =>
		entry.type === "ellipsis" ? "…" : entry.page,
	);

describe("generatePageNumbers", () => {
	it("lists every page while they all fit", () => {
		expect(pages(0, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});

	it("collapses the tail when the current page is at the start", () => {
		expect(pages(0, 20)).toEqual([0, 1, "…", 19]);
	});

	it("collapses both sides around the current page", () => {
		expect(pages(10, 20)).toEqual([0, "…", 9, 10, 11, "…", 19]);
	});

	it("collapses the head when the current page is at the end", () => {
		expect(pages(19, 20)).toEqual([0, "…", 18, 19]);
	});

	it("keeps the first and last page reachable at every position", () => {
		for (let current = 0; current < 20; current++) {
			const entries = pages(current, 20);
			expect(entries[0]).toBe(0);
			expect(entries.at(-1)).toBe(19);
			expect(entries).toContain(current);
		}
	});

	it("emits unique keys so React never sees a duplicate", () => {
		for (const total of [1, 7, 8, 20]) {
			for (let current = 0; current < total; current++) {
				const keys = generatePageNumbers(current, total).map((e) => e.key);
				expect(new Set(keys).size).toBe(keys.length);
			}
		}
	});
});
