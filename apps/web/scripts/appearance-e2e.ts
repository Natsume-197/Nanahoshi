// Preview: bunx vite --config scripts/appearance-preview.config.ts
// Check: bun scripts/appearance-e2e.ts
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({
	executablePath: process.env.READER_E2E_BROWSER,
	headless: true,
	args: ["--no-sandbox"],
});
try {
	const page = await browser.newPage({
		viewport: { width: 1150, height: 1300 },
	});
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("http://127.0.0.1:3023/scripts/fixtures/appearance.html");
	const button = (name: string) =>
		page.getByRole("button", { name, exact: true });
	await page
		.getByRole("heading", { name: "Apariencia", exact: true })
		.waitFor();
	await button("Bosque · Oscuro").click();
	assert.equal(
		await page.evaluate(
			() => JSON.parse(localStorage.getItem("theme-palette") ?? "null").id,
		),
		"preset-forest",
	);
	await button("Claro").click();
	assert.equal(
		await page.evaluate(
			() => JSON.parse(localStorage.getItem("theme-palette") ?? "null").base,
		),
		"light",
	);
	assert.equal(
		await button("Bosque · Claro").getAttribute("aria-pressed"),
		"true",
	);
	await button("Océano · Oscuro").click();
	await page.screenshot({
		path: "/tmp/appearance-gallery-desktop.png",
		fullPage: true,
	});
	await button("Personalizar tema").click();
	await page.getByRole("button", { name: /^Degradado/ }).click();
	await button("Al azar").click();
	await button("Guardar tema").click();
	const saved = await page.evaluate(() =>
		localStorage.getItem("theme-palette"),
	);
	assert(saved);
	await button("Al azar").click();
	await button("Descartar").click();
	assert.equal(
		await page.evaluate(() => localStorage.getItem("theme-palette")),
		saved,
	);
	await page.screenshot({
		path: "/tmp/appearance-desktop.png",
		fullPage: true,
	});
	for (const width of [390, 320]) {
		await page.setViewportSize({ width, height: 844 });
		for (const mode of [/^Un color/, /^Degradado/, /^Colores manuales/]) {
			await page.getByRole("button", { name: mode }).click();
			assert(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
				`overflow at ${width}: ${mode}`,
			);
		}
	}
	await page.screenshot({ path: "/tmp/appearance-mobile.png", fullPage: true });
	await page.locator("summary").click();
	await page.screenshot({
		path: "/tmp/appearance-gallery-mobile.png",
		fullPage: true,
	});
	await button("Personalizar tema").click();
	await button("Guardar tema").click();
	await page.reload();
	await button("Personalizar tema").click();
	await page.getByRole("button", { name: /^Colores manuales/ }).waitFor();
	assert.equal(
		await page
			.getByRole("button", { name: /^Colores manuales/ })
			.getAttribute("aria-pressed"),
		"true",
	);
	await page.getByRole("button", { name: /^Un color/ }).click();
	await page.getByLabel("Color de partida", { exact: true }).fill("#000000");
	await button("Guardar tema").click();
	const seed = await page.evaluate(
		() => JSON.parse(localStorage.getItem("theme-palette") ?? "null").vars,
	);
	await page.reload();
	await button("Personalizar tema").click();
	await page.getByRole("button", { name: /^Un color/ }).waitFor();
	assert.equal(
		await page.evaluate(() =>
			document.documentElement.style.getPropertyValue("--primary"),
		),
		seed["--primary"],
	);
	assert.deepEqual(errors, []);
	console.log(
		"PASS: modes, randomize, save, discard, reload, mobile overflow and browser errors",
	);
} finally {
	await browser.close();
}
