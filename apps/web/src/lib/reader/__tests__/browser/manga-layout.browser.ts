/**
 * Real-layout regression for fixed-layout EPUB manga pages. Run directly with
 * `bun run src/lib/reader/__tests__/browser/manga-layout.browser.ts`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

function findChromium(): string | undefined {
	const root = path.join(homedir(), ".cache", "ms-playwright");
	if (!existsSync(root)) return undefined;
	for (const directory of readdirSync(root)) {
		const executable = directory.startsWith("chromium_headless_shell")
			? path.join(
					root,
					directory,
					"chrome-headless-shell-linux64",
					"chrome-headless-shell",
				)
			: path.join(root, directory, "chrome-linux64", "chrome");
		if (existsSync(executable)) return executable;
	}
	return undefined;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const readerCss = readFileSync(
	path.resolve(here, "../../../../components/reader/reader.css"),
	"utf8",
);
function fixture(mode: "paginated" | "vertical-strip" | "horizontal-strip") {
	const readerMode =
		mode === "vertical-strip"
			? "book-content--manga-continuous"
			: mode === "horizontal-strip"
				? "book-content--manga-horizontal-strip"
				: "";
	const canvasMode =
		mode === "vertical-strip"
			? "manga-page-canvas--continuous"
			: mode === "horizontal-strip"
				? "manga-page-canvas--horizontal-strip"
				: "";
	return `<!doctype html><html><head><style>
	* { box-sizing: border-box; }
	html, body { margin: 0; width: 100%; height: 100%; }
	.reader { display: flex; width: 100vw; height: 100vh; align-items: center; justify-content: center; }
	.manga-page-canvas { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; }
	${readerCss}
	/* Exact reset pattern emitted by the affected fixed-layout EPUB after the
	   application stylesheet. The visual reader must remain authoritative. */
	.book-content div, .book-content p { display: block; width: auto; height: auto; margin: 0; padding: 0; }
</style></head><body>
	<div class="reader book-content book-content--manga ${readerMode}">
		<div class="manga-page-canvas ${canvasMode}">
			<div class="manga-page-slot" style="width:492px;height:700px;flex:none;aspect-ratio:1441/2048">
				<div><div><div class="ttu-book-html-wrapper ttu-no-text"><div class="ttu-book-body-wrapper ttu-no-text">
					<div class="main"><span class="ttu-img-parent"><svg width="100%" height="100%" viewBox="0 0 1441 2048"><image width="100%" height="100%" /></svg></span></div>
				</div></div></div></div>
			</div>
		</div>
	</div>
</body></html>`;
}

const executablePath = findChromium();
if (!executablePath) throw new Error("Chromium is required for this harness");
const browser = await chromium.launch({ executablePath });
try {
	for (const mode of [
		"paginated",
		"vertical-strip",
		"horizontal-strip",
	] as const) {
		const page = await browser.newPage({
			viewport: { width: 1000, height: 700 },
		});
		await page.setContent(fixture(mode));
		const dimensions = await page.evaluate(() => {
			const canvas = document.querySelector(".manga-page-canvas");
			const slot = document
				.querySelector(".manga-page-slot")
				?.getBoundingClientRect();
			const main = document.querySelector(".main")?.getBoundingClientRect();
			const svg = document.querySelector("svg")?.getBoundingClientRect();
			return {
				canvasDisplay: canvas ? getComputedStyle(canvas).display : null,
				slot: { width: slot?.width, height: slot?.height },
				main: { width: main?.width, height: main?.height },
				svg: { width: svg?.width, height: svg?.height },
			};
		});
		console.log(mode, JSON.stringify(dimensions));
		if (
			dimensions.canvasDisplay !== "flex" ||
			Math.abs((dimensions.main.width ?? 0) - (dimensions.slot.width ?? 0)) >
				1 ||
			Math.abs((dimensions.main.height ?? 0) - (dimensions.slot.height ?? 0)) >
				1 ||
			Math.abs((dimensions.svg.width ?? 0) - (dimensions.slot.width ?? 0)) >
				1 ||
			Math.abs((dimensions.svg.height ?? 0) - (dimensions.slot.height ?? 0)) > 1
		) {
			throw new Error(`${mode} artwork does not fill its fitted flex slot`);
		}
		await page.close();
	}
} finally {
	await browser.close();
}
