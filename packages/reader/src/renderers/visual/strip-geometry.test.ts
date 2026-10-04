import { expect, test } from "bun:test";
import { findHorizontalStripPage } from "./strip-geometry";

for (const direction of ["ltr", "rtl"] as const) {
	test(`${direction}: variable widths, gaps, boundaries and logarithmic reads`, () => {
		let offset = 0;
		const pages = Array.from({ length: 1000 }, (_, index) => {
			const start = offset;
			offset += 50 + (index % 300);
			const end = offset;
			offset += 10;
			return direction === "rtl"
				? { left: -end, right: -start }
				: { left: start, right: end };
		});
		const bounds = (index: number) => {
			const page = pages[index];
			if (!page) throw new Error("Page index out of range");
			return page;
		};
		for (const index of [0, 1, 498, 998, 999]) {
			let reads = 0;
			const page = bounds(index);
			expect(
				findHorizontalStripPage(
					pages.length,
					(page.left + page.right) / 2,
					direction,
					(i) => {
						reads++;
						return bounds(i);
					},
				),
			).toBe(index);
			expect(reads).toBeLessThanOrEqual(10);
		}
		const sign = direction === "rtl" ? -1 : 1;
		expect(
			findHorizontalStripPage(pages.length, -100 * sign, direction, (i) =>
				bounds(i),
			),
		).toBe(0);
		expect(
			findHorizontalStripPage(
				pages.length,
				(offset + 100) * sign,
				direction,
				(i) => bounds(i),
			),
		).toBe(999);
		expect(
			findHorizontalStripPage(pages.length, 54 * sign, direction, (i) =>
				bounds(i),
			),
		).toBe(0);
		expect(
			findHorizontalStripPage(pages.length, 56 * sign, direction, (i) =>
				bounds(i),
			),
		).toBe(1);
	});
}
