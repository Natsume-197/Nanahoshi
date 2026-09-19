import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import type {} from "./fixtures/read-listen-highlight";

const outdir = mkdtempSync(join(tmpdir(), "read-listen-highlight-"));
const build = await Bun.build({
	entrypoints: [resolve(import.meta.dir, "fixtures/read-listen-highlight.tsx")],
	outdir,
	target: "browser",
	plugins: [
		{
			name: "audio-fixture",
			setup(build) {
				build.onResolve({ filter: /^(.*\/)?audio-player-context$/ }, () => ({
					path: "audio",
					namespace: "fixture",
				}));
				build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
					contents:
						"export const useAudioPlayerActions = () => ({}); export const useAudioPlayerBook = () => null; export const toPlayerData = x => x;",
					loader: "js",
				}));
			},
		},
	],
});
if (!build.success) throw new Error(build.logs.join("\n"));
const css = await Bun.file(
	resolve(import.meta.dir, "../src/features/reader/ui/styles/reader.css"),
).text();
const server = Bun.serve({
	port: 0,
	hostname: "127.0.0.1",
	fetch(request) {
		if (new URL(request.url).pathname === "/fixture.js")
			return new Response(Bun.file(join(outdir, "read-listen-highlight.js")), {
				headers: { "content-type": "text/javascript" },
			});
		return new Response(
			`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0} :root{--safe-area-bottom:0px;--reader-player-reserve-mobile:80px;--reader-player-reserve-desktop:80px} ${css}</style></head><body><main class="reader-route-content" id="root"></main><script type="module" src="/fixture.js"></script></body></html>`,
			{ headers: { "content-type": "text/html" } },
		);
	},
});
const browser = await chromium.launch({
	executablePath: process.env.READER_E2E_BROWSER ?? "/opt/google/chrome/chrome",
	headless: true,
	args: ["--no-sandbox"],
});
async function touchReader(page: Page, dx: number, dy: number) {
	await page.evaluate(
		({ dx, dy }) => {
			const target = document.querySelector(".book-content p");
			if (!target) throw new Error("Missing reader paragraph");
			const start = new Touch({
				identifier: 1,
				target,
				clientX: 100,
				clientY: 100,
			});
			const end = new Touch({
				identifier: 1,
				target,
				clientX: 100 + dx,
				clientY: 100 + dy,
			});
			target.dispatchEvent(
				new TouchEvent("touchstart", {
					bubbles: true,
					cancelable: true,
					touches: [start],
					changedTouches: [start],
				}),
			);
			target.dispatchEvent(
				new PointerEvent("pointermove", {
					bubbles: true,
					pointerType: "touch",
					buttons: 1,
					movementX: dx,
					movementY: dy,
				}),
			);
			target.dispatchEvent(
				new TouchEvent("touchmove", {
					bubbles: true,
					cancelable: true,
					touches: [end],
					changedTouches: [end],
				}),
			);
			target.dispatchEvent(
				new TouchEvent("touchend", {
					bubbles: true,
					cancelable: true,
					touches: [],
					changedTouches: [end],
				}),
			);
		},
		{ dx, dy },
	);
}
const failures: string[] = [];
let checks = 0;
try {
	for (const viewport of [
		{ width: 360, height: 640 },
		{ width: 390, height: 844 },
		{ width: 844, height: 390 },
		{ width: 768, height: 1024 },
		{ width: 1280, height: 900 },
	]) {
		const mobile = Math.min(viewport.width, viewport.height) < 600;
		const page = await browser.newPage({
			viewport,
			reducedMotion: "reduce",
			isMobile: mobile,
			hasTouch: mobile,
			deviceScaleFactor: mobile ? 2 : 1,
		});
		page.on("pageerror", (error) => failures.push(`BROWSER ${error.message}`));
		for (const config of [
			"columns=1",
			"columns=1&boundary=true&avoid=true",
			"columns=2&boundary=true&avoid=true",
			"vertical=true&boundary=true&avoid=true",
			"columns=1&boundary=true&avoid=false",
			"columns=2&boundary=true&avoid=false",
			"vertical=true&boundary=true&avoid=false",
			"columns=2",
			"vertical=true",
			"mode=scroll",
			"mode=scroll&vertical=true",
			"columns=1&delay=100",
			"columns=2&delay=100",
			"vertical=true&delay=100",
			"columns=1&packed=true",
			"columns=1&ruby=true&playback=true",
			"columns=2&ruby=true&playback=true",
			"vertical=true&ruby=true&playback=true",
			"columns=1&touch=true",
			"columns=2&touch=true",
			"vertical=true&touch=true",
			"columns=2&packed=true",
			"vertical=true&packed=true",
		]) {
			const name = `${viewport.width}x${viewport.height}/${config}`;
			if (process.argv[2] && !name.includes(process.argv[2])) continue;
			await page.goto(`http://127.0.0.1:${server.port}/?${config}`);
			await page.waitForFunction(() => Boolean(window.fixture));
			const check = async (label: string) => {
				const expected = await page.evaluate(() => window.fixture.expected);
				try {
					await page.waitForFunction(
						(expected) => {
							const ranges = [
								...(CSS.highlights.get("read-listen-active") ?? []),
							] as Range[];
							const text = ranges.map((range) => range.toString()).join("");
							const rects = ranges
								.flatMap((range) => [...range.getClientRects()])
								.filter((rect) => rect.width > 0 && rect.height > 0);
							// Pagination must expose the beginning of the next sentence, not
							// merely a trailing fragment on an adjacent spread.
							const candidates = document.querySelector(
								".book-content--paginated",
							)
								? rects.slice(0, 1)
								: rects;
							const visible = candidates.some(
								(rect) =>
									rect.right > 0 &&
									rect.left < innerWidth &&
									rect.bottom > 0 &&
									rect.top < innerHeight - 80,
							);
							return text === expected && visible;
						},
						expected,
						{ timeout: 2000 },
					);
					checks++;
				} catch {
					const state = await page.evaluate(() => ({
						expected: window.fixture.expected,
						ranges: [...(CSS.highlights.get("read-listen-active") ?? [])].map(
							(range: Range) => ({
								text: range.toString(),
								rects: [...range.getClientRects()].map((rect) => ({
									x: rect.x,
									y: rect.y,
									w: rect.width,
									h: rect.height,
								})),
							}),
						),
					}));
					failures.push(`${name}/${label}: ${JSON.stringify(state)}`);
					console.log(failures.at(-1));
				}
			};
			await check("entry");
			if (config.includes("playback")) {
				await page.evaluate(() => window.fixture.play());
				const deadline = Date.now() + 25000;
				let lastCue = -1;
				while (!(await page.evaluate(() => window.fixture.audio?.ended))) {
					if (Date.now() > deadline)
						throw new Error(`${name}: audio did not finish`);
					await page.waitForTimeout(80);
					const cue = await page.evaluate(() => window.fixture.index);
					if (cue === lastCue) continue;
					lastCue = cue;
					await check(`playing-${cue}`);
					if (!(await page.evaluate(() => window.fixture.following)))
						throw new Error(`${name}: following stopped without input`);
				}
				if (lastCue < 62)
					throw new Error(
						`${name}: playback did not cross the chapter boundary`,
					);
				await check("playback-ended");
			}

			if (config.includes("touch")) {
				await touchReader(page, 2, 1);
				await page.waitForTimeout(50);
				if (!(await page.evaluate(() => window.fixture.following)))
					throw new Error(
						`${name}: a 2px touch disabled automatic page following`,
					);
				checks++;
			}
			// Consecutive sentences span multiple pages and a chapter boundary.
			for (const cue of config.includes("packed") || config.includes("boundary")
				? [...Array.from({ length: 64 }, (_, index) => index), 0]
				: [1, 6, 15, 30, 31, 32, 33, 256, 263, 32, 288, 0]) {
				await page.evaluate((cue) => window.fixture.cue(cue), cue);
				await page.waitForFunction((cue) => window.fixture.index === cue, cue);
				await check(`cue-${cue}`);
			}
			await page.evaluate(() => window.fixture.replace());
			await page.waitForTimeout(100);
			await check("same-section-replacement");
			await page.evaluate(() => window.fixture.reenter());
			await page.waitForFunction(() => window.fixture.entry === 1);
			await check("reentry");
			for (const cue of [263, 32, 288, 6, 0]) {
				await page.evaluate((cue) => window.fixture.cue(cue), cue);
				await page.waitForFunction((cue) => window.fixture.index === cue, cue);
				await page.waitForTimeout(10);
			}
			await page.waitForTimeout(200);
			await check("rapid-seeks");
			await page.evaluate(() => window.fixture.cue(263));
			await page.waitForFunction(() => window.fixture.index === 263);
			await check("advanced-position");
			const rotations =
				viewport.width === 1280 && config === "mode=scroll&vertical=true"
					? 5
					: 1;
			for (let rotation = 0; rotation < rotations; rotation++) {
				await page.setViewportSize({
					width: viewport.height,
					height: viewport.width,
				});
				await page.waitForTimeout(250);
				await check("live-orientation-change");
				await page.setViewportSize(viewport);
				await page.waitForTimeout(250);
				await check("orientation-restored");
			}
			if (config.includes("touch")) {
				const vertical = config.includes("vertical=true");
				await touchReader(page, vertical ? 0 : -80, vertical ? -80 : 0);
				await page.waitForFunction(() => !window.fixture.following, undefined, {
					timeout: 1000,
				});
				checks++;
				await page.evaluate(() => window.fixture.resume());
				await page.waitForFunction(() => window.fixture.following);
				await check("resume-after-manual-swipe");
			}
			console.log(`CHECKED ${name}`);
		}
		await page.close();
	}
	const page = await browser.newPage({
		viewport: { width: 390, height: 844 },
		reducedMotion: "reduce",
	});
	for (const config of [
		"columns=1",
		"columns=2",
		"vertical=true",
		"mode=scroll",
		"mode=scroll&vertical=true",
	]) {
		for (const cue of [0, 263]) {
			await page.goto(
				`http://127.0.0.1:${server.port}/?delay=800&cue=${cue}&${config}`,
			);
			try {
				await page.waitForFunction(
					() => {
						const ranges = [
							...(CSS.highlights.get("read-listen-active") ?? []),
						] as Range[];
						return (
							ranges.map((range) => range.toString()).join("") ===
								window.fixture.expected &&
							ranges.some((range) =>
								[...range.getClientRects()].some(
									(rect) =>
										rect.width > 0 &&
										rect.height > 0 &&
										rect.right > 0 &&
										rect.left < innerWidth &&
										rect.bottom > 0 &&
										rect.top < innerHeight - 80,
								),
							)
						);
					},
					undefined,
					{ timeout: 3000 },
				);
				checks++;
			} catch {
				failures.push(`Delayed entry/${config}/cue-${cue}`);
			}
		}
	}
	await page.screenshot({ path: "/tmp/read-listen-highlight-tategaki.png" });
	console.log(JSON.stringify({ checks, failures }, null, 2));
	if (failures.length) process.exitCode = 1;
} finally {
	await browser.close();
	server.stop();
	rmSync(outdir, { recursive: true, force: true });
}
