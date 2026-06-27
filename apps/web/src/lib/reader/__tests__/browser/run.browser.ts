/**
 * Browser characterization harness for the layout-dependent reader calculators.
 *
 * Why this exists: CharacterStatsCalculator reads getBoundingClientRect, which
 * returns zeros under jsdom — so its char-count <-> scroll-position math cannot
 * be unit-tested. This runner bundles the real calculator, loads it over real
 * CSS layout in headless Chromium, and asserts the round-trip invariant in both
 * writing modes: after scrolling to getReadingEdgeScrollPos(C),
 * calcExploredCharCount() returns exactly C.
 *
 * It is NOT a `*.test.ts` file (so `bun test` never runs it — it needs a
 * browser binary). Run it with `bun run test:browser` from apps/web. Exits
 * non-zero on any failed assertion or if no Chromium binary is found.
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));

function findChromium(): string | undefined {
	if (process.env.READER_HARNESS_CHROMIUM) {
		return process.env.READER_HARNESS_CHROMIUM;
	}
	const root = path.join(homedir(), ".cache", "ms-playwright");
	if (!existsSync(root)) return undefined;
	const candidates: string[] = [];
	for (const dir of readdirSync(root)) {
		if (dir.startsWith("chromium_headless_shell")) {
			candidates.push(
				path.join(
					root,
					dir,
					"chrome-headless-shell-linux64",
					"chrome-headless-shell",
				),
			);
		} else if (dir.startsWith("chromium-")) {
			candidates.push(path.join(root, dir, "chrome-linux64", "chrome"));
			candidates.push(path.join(root, dir, "chrome-linux", "chrome"));
		}
	}
	return candidates.find((p) => existsSync(p));
}

async function bundleCalculator(): Promise<string> {
	const result = await Bun.build({
		entrypoints: [path.join(here, "calculator-entry.ts")],
		format: "iife",
		target: "browser",
		minify: false,
	});
	if (!result.success) {
		throw new Error(`bundle failed: ${result.logs.join("\n")}`);
	}
	return await result.outputs[0].text();
}

function fixtureHtml(vertical: boolean): string {
	const base =
		"吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。";
	const paras = Array.from(
		{ length: 60 },
		(_, i) => `<p>${i}:${base}${base}</p>`,
	).join("");
	const writingMode = vertical
		? "writing-mode: vertical-rl; overflow-y: hidden;"
		: "overflow-x: hidden;";
	return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
    html { ${writingMode} overflow-anchor: none; margin: 0; }
    body { margin: 0; }
    #content { font-size: 20px; line-height: 1.65; font-family: serif;
      ${vertical ? "height: 100dvh;" : "max-width: 600px; margin: 0 auto;"}
      ${vertical ? "padding-right: 40px; padding-left: 40px;" : "padding-top: 40px; padding-bottom: 40px;"} }
    #content > * { ${vertical ? "height: 100%;" : ""} }
    #content p { margin: 0 0 1.5em 0; }
  </style></head><body><div id="content"><div id="sec">${paras}</div></div></body></html>`;
}

interface Sample {
	frac: number;
	charCount: number;
	restored: number;
	match: boolean;
}

interface CalcInstance {
	calcExploredCharCount(): number;
	getReadingEdgeScrollPos(c: number): number;
	updateParagraphPos(): void;
}
type CalcCtor = new (
	containerEl: HTMLElement,
	axis: "horizontal" | "vertical",
	direction: "ltr" | "rtl",
	scrollEl: HTMLElement,
	doc: Document,
) => CalcInstance;

async function runMode(
	browser: Browser,
	bundle: string,
	vertical: boolean,
): Promise<Sample[]> {
	const page = await browser.newPage({
		viewport: { width: 1000, height: 700 },
	});
	await page.setContent(fixtureHtml(vertical));
	await page.addScriptTag({ content: bundle });

	return page.evaluate((isVertical) => {
		const Ctor = (window as unknown as { CharacterStatsCalculator: CalcCtor })
			.CharacterStatsCalculator;

		const content = document.getElementById("content") as HTMLElement;
		const calc = new Ctor(
			content,
			isVertical ? "vertical" : "horizontal",
			isVertical ? "rtl" : "ltr",
			document.documentElement,
			document,
		);
		calc.updateParagraphPos();

		const de = document.documentElement;
		const out: Sample[] = [];
		const maxScroll = isVertical
			? Math.abs(de.scrollWidth - de.clientWidth)
			: de.scrollHeight - de.clientHeight;

		for (let frac = 0.1; frac <= 0.85; frac += 0.15) {
			if (isVertical) window.scrollTo({ left: -Math.round(maxScroll * frac) });
			else window.scrollTo({ top: Math.round(maxScroll * frac) });

			const charCount = calc.calcExploredCharCount();
			const pos = calc.getReadingEdgeScrollPos(charCount);
			if (isVertical) window.scrollTo({ left: pos });
			else window.scrollTo({ top: pos });

			const restored = calc.calcExploredCharCount();
			out.push({
				frac: Number(frac.toFixed(2)),
				charCount,
				restored,
				match: restored === charCount,
			});
		}
		return out;
	}, vertical);
}

async function main() {
	const exe = findChromium();
	if (!exe) {
		console.error(
			"No Chromium binary found. Set READER_HARNESS_CHROMIUM or install a\n" +
				"Playwright Chromium (e.g. `bunx playwright-core install chromium`).",
		);
		process.exit(2);
	}

	const bundle = await bundleCalculator();
	let failed = 0;

	const browser = await chromium.launch({ executablePath: exe });
	try {
		for (const vertical of [true, false]) {
			const label = vertical ? "vertical-rl" : "horizontal-tb";
			const samples = await runMode(browser, bundle, vertical);
			for (const s of samples) {
				const ok = s.match ? "ok" : "DIFF";
				console.log(
					`[${label}] frac=${s.frac} C=${s.charCount} restored=${s.restored} ${ok}`,
				);
				if (!s.match) failed++;
			}
		}
	} finally {
		await browser.close();
	}

	if (failed > 0) {
		console.error(`\n✗ ${failed} round-trip mismatch(es)`);
		process.exit(1);
	}
	console.log("\n✓ char-count round-trip exact in both writing modes");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
