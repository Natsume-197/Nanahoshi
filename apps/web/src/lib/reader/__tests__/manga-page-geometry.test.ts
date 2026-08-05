import "@/test-utils/setup-dom";
import { expect, test } from "bun:test";
import { fitMangaPage, readMangaPageGeometry } from "../manga-page-geometry";

test("reads fixed-layout manga dimensions from the SVG viewBox", () => {
	const page = document.createElement("div");
	page.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 1441 2048">
		<image width="100%" height="100%" href="page.jpeg" />
	</svg>`;
	expect(readMangaPageGeometry(page)).toEqual({ width: 1441, height: 2048 });
});

test("fits portrait and landscape pages inside the available viewport", () => {
	const portrait = fitMangaPage(
		{ width: 1441, height: 2048 },
		{ width: 1000, height: 700 },
	);
	expect(portrait.width).toBeCloseTo(492.53);
	expect(portrait.height).toBe(700);
	const landscape = fitMangaPage(
		{ width: 2048, height: 1441 },
		{ width: 1000, height: 700 },
	);
	expect(landscape.width).toBeCloseTo(994.86);
	expect(landscape.height).toBe(700);
});
