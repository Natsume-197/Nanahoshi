/** Full-component regression for the initial two-page-spread manga spread. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const browserRoot = path.join(homedir(), ".cache", "ms-playwright");
const executablePath = readdirSync(browserRoot)
	.map((directory) =>
		directory.startsWith("chromium_headless_shell")
			? path.join(
					browserRoot,
					directory,
					"chrome-headless-shell-linux64",
					"chrome-headless-shell",
				)
			: path.join(browserRoot, directory, "chrome-linux64", "chrome"),
	)
	.find(existsSync);
if (!executablePath) throw new Error("Chromium is required for this harness");

const build = await Bun.build({
	entrypoints: [path.join(here, "manga-component-entry.tsx")],
	target: "browser",
	format: "iife",
});
if (!build.success) throw new Error(build.logs.join("\n"));
const javascript = await build.outputs[0].text();
const readerCss = readFileSync(
	path.resolve(here, "../../../../components/reader/reader.css"),
	"utf8",
);
const utilityCss = `
	* { box-sizing: border-box; }
	html, body, #root { width: 100%; height: 100%; margin: 0; }
	.relative { position: relative; } .flex { display: flex; }
	.h-dvh { height: 100dvh; } .w-dvw { width: 100dvw; }
	.h-full { height: 100%; } .w-full { width: 100%; }
	.min-h-full { min-height: 100%; } .min-w-full { min-width: 100%; }
	.items-center { align-items: center; } .justify-center { justify-content: center; }
	.overflow-hidden { overflow: hidden; }
`;

const browser = await chromium.launch({ executablePath });
try {
	const page = await browser.newPage({
		viewport: { width: 1000, height: 700 },
	});
	await page.setContent(
		`<!doctype html><html><head><style>${utilityCss}${readerCss}</style></head><body><div id="root"></div></body></html>`,
	);
	await page.addScriptTag({ content: javascript });
	await page.waitForSelector(".manga-page-slot");
	const result = await page.evaluate(() => {
		const slots = Array.from(
			document.querySelectorAll<HTMLElement>(".manga-page-slot"),
		);
		return {
			count: slots.length,
			pages: slots.map((slot) => slot.dataset.mangaPageIndex),
			widths: slots.map((slot) => slot.getBoundingClientRect().width),
			heights: slots.map((slot) => slot.getBoundingClientRect().height),
		};
	});
	console.log(JSON.stringify(result));
	if (result.count !== 2)
		throw new Error("two-page-spread did not render two pages");
	if (result.heights.some((height) => height < 690)) {
		throw new Error(
			"two-page-spread did not use the available viewport height",
		);
	}
} finally {
	await browser.close();
}
