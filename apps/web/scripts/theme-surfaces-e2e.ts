// Start the appearance-preview.config.ts Vite server first.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({
	executablePath: process.env.READER_E2E_BROWSER,
	headless: true,
	args: ["--no-sandbox"],
});
try {
	const page = await browser.newPage({
		viewport: { width: 1200, height: 850 },
	});
	page.setDefaultTimeout(10000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	for (const base of ["light", "dark"]) {
		const surfaces: string[][] = [];
		for (const color of ["#a855f7", "#22c55e"]) {
			await page.goto(
				`http://127.0.0.1:3023/scripts/fixtures/theme-surfaces.html?base=${base}&color=${encodeURIComponent(color)}`,
			);
			const categories = page.getByRole("group", { name: "Categorías" });
			await categories.waitFor();
			assert.equal(
				await categories.evaluate(
					(el) => getComputedStyle(el.parentElement ?? el).backgroundColor,
				),
				"rgba(0, 0, 0, 0)",
			);
			await page.getByRole("button", { name: "Menú de prueba" }).click();
			const menu = page.getByRole("menu");
			await menu.waitFor();
			const menuColor = await menu.evaluate(
				(el) => getComputedStyle(el).backgroundColor,
			);
			await page.keyboard.press("Escape");
			const search = page.getByRole("combobox");
			await search.fill("Libro");
			const result = page.getByRole("option", { name: /Libro de prueba/ });
			await result.waitFor();
			await result.hover();
			const hoverColor = await result.evaluate(
				(el) => getComputedStyle(el).backgroundColor,
			);
			const searchColor = await page
				.getByRole("listbox")
				.evaluate((el) => getComputedStyle(el).backgroundColor);
			await page.screenshot({
				animations: "disabled",
				path: `/tmp/theme-search-${base}.png`,
			});
			await categories
				.getByRole("button", { name: "Inicio", exact: true })
				.click();
			await page.getByRole("button", { name: "Abrir ajustes" }).click();
			const aside = page.getByRole("dialog").locator("aside");
			await aside.waitFor();
			const sidebarColor = await aside.evaluate(
				(el) => getComputedStyle(el).backgroundColor,
			);
			assert.notEqual(
				await aside.evaluate((el) => getComputedStyle(el).backgroundImage),
				"none",
			);
			await page.screenshot({
				animations: "disabled",
				path: `/tmp/theme-settings-${base}.png`,
			});
			surfaces.push([menuColor, searchColor, hoverColor, sidebarColor]);
		}
		for (let i = 0; i < 4; i++)
			assert.notEqual(
				surfaces[0][i],
				surfaces[1][i],
				`unthemed surface ${i} in ${base}`,
			);
	}
	assert.deepEqual(errors, []);
	console.log(
		"PASS: transparent categories; themed portal menus, search results/hover and settings sidebar in light/dark",
	);
} finally {
	await browser.close();
}
