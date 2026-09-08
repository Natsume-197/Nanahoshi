// Start: bunx vite --config scripts/reading-sessions-preview.config.ts
// Run: READER_E2E_BROWSER=/path/to/chrome bun scripts/reading-sessions-e2e.ts
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import type { SessionUpload } from "@nanahoshi-v2/api/routers/reading-sessions/reading-sessions.model";
import { chromium, type Page } from "playwright-core";

const artifacts =
	process.env.READING_SESSIONS_E2E_ARTIFACTS ?? "/tmp/nanahoshi-reading-e2e";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
	executablePath: process.env.READER_E2E_BROWSER,
	headless: true,
	args: ["--no-sandbox"],
});
const url = `${process.env.READING_SESSIONS_E2E_URL ?? "http://127.0.0.1:3017"}/scripts/fixtures/reading-sessions.html`;
const failures: string[] = [];
const scenarios = process.env.READING_SESSIONS_E2E_SCENARIOS?.split(",");
const prefix = "nanahoshi:reading-outbox:preview:";
type StoredSession = SessionUpload & { acknowledgedRevision?: number };
const trigger = (page: Page) =>
	page.getByRole("button", { name: "Sesión de lectura", exact: true });
const action = (page: Page, name: string) =>
	page.getByRole("button", { name, exact: true });

async function records(page: Page): Promise<StoredSession[]> {
	return page.evaluate(
		(prefix) =>
			Object.keys(localStorage)
				.filter((key) => key.startsWith(prefix))
				.map((key) => JSON.parse(localStorage.getItem(key) ?? "null")),
		prefix,
	);
}
async function flushed(page: Page) {
	await page.waitForFunction((prefix) => {
		const rows = Object.keys(localStorage)
			.filter((key) => key.startsWith(prefix))
			.map((key) => JSON.parse(localStorage.getItem(key) ?? "null"));
		return (
			rows.length > 0 &&
			rows.every(
				(row) =>
					row.acknowledgedRevision === row.revision &&
					row.segments.length === 0,
			)
		);
	}, prefix);
}
async function seconds(page: Page) {
	await page.waitForTimeout(50);
	const clock = page.locator('[data-reading-controls] p[aria-live="off"]');
	if (!(await clock.isVisible())) await trigger(page).click();
	const text = (await clock.innerText()).trim();
	assert.match(text, /^\d{2}:\d{2}:\d{2}$/, "Popover must display HH:MM:SS");
	const [h, m, s] = text.split(":").map(Number);
	return h * 3600 + m * 60 + s;
}
async function open(page: Page) {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.getByRole("heading", { name: "Historial de lectura" }).waitFor();
}
async function screenshot(page: Page, name: string) {
	await page.screenshot({
		path: `${artifacts}/reading-${name}.png`,
		fullPage: true,
		animations: "disabled",
	});
}
async function check(name: string, run: (page: Page) => Promise<void>) {
	if (scenarios && !scenarios.includes(name)) return;
	const previousFailures = failures.length;
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1100 },
		locale: "es",
		timezoneId: "America/Bogota",
		reducedMotion: "reduce",
	});
	const errors: string[] = [];
	context.on("page", (page) =>
		page.on("pageerror", (error) => errors.push(error.message)),
	);
	const page = await context.newPage();
	page.setDefaultTimeout(10000);
	try {
		await run(page);
		assert.deepEqual(errors, [], "Browser runtime errors");
		console.log(failures.length === previousFailures ? "PASS" : "FAIL", name);
	} catch (error) {
		failures.push(`${name}: ${error instanceof Error ? error.message : error}`);
		console.error("FAIL", failures.at(-1));
		if (!page.isClosed())
			await screenshot(page, `failure-${name}`).catch(() => {});
	} finally {
		await context.close();
	}
}

try {
	console.log("CHROMIUM", browser.version(), "URL", url);
	await check("history-empty", async (page) => {
		await page.goto(`${url}?history=empty`, {
			waitUntil: "domcontentloaded",
			timeout: 60000,
		});
		await action(page, "Añadir sesión").click();
		await page.getByRole("dialog").waitFor();
		await page.getByLabel("Minutos de lectura", { exact: true }).waitFor();
		await screenshot(page, "empty-add");
	});
	await check("history-old", async (page) => {
		await page.goto(`${url}?history=old`, {
			waitUntil: "domcontentloaded",
			timeout: 60000,
		});
		await page
			.getByText("No hay sesiones de lectura en los últimos 30 días.")
			.waitFor();
		await action(page, "Toda la lectura").click();
		await action(page, "Ver más días").click();
		const diary = page.locator("[data-reading-diary]");
		assert.equal(await diary.locator("[data-reading-session]").count(), 20);
		const days = diary.locator("button[aria-expanded]");
		assert.equal(await days.count(), 17);
		assert.equal(await diary.locator("button[aria-expanded=true]").count(), 0);
		await days.first().click();
		assert.equal(await days.first().getAttribute("aria-expanded"), "true");
		await diary
			.locator("[data-reading-session]")
			.getByText("58 % → 63 %", { exact: true })
			.waitFor();
		assert.equal(await action(page, "Corregir sesión").count(), 1);
		await action(page, "Corregir sesión").click();
		await page.getByRole("dialog", { name: "Corregir sesión" }).waitFor();
		await page.keyboard.press("Escape");
		await page.getByRole("dialog").waitFor({ state: "hidden" });
		await screenshot(page, "old-all");
		const points = page.locator("[data-reading-chart]").getByRole("button");
		assert.equal(await points.count(), 17);
		await points.first().focus();
		assert.equal(await points.first().getAttribute("aria-pressed"), "true");
		await page.keyboard.press("ArrowRight");
		assert.equal(await points.nth(1).getAttribute("aria-pressed"), "true");
		await page.keyboard.press("End");
		assert.equal(await points.last().getAttribute("aria-pressed"), "true");
		await action(page, "Posición").click();
		const positions = page.locator("[data-reading-chart]").getByRole("button");
		assert.equal(await positions.count(), 17);
		const chartPath = await page
			.locator("[data-reading-chart] path")
			.getAttribute("d");
		assert.equal(
			chartPath?.match(/M/g)?.length,
			2,
			"Unknown positions must break the line",
		);
		await positions.first().click();
		assert.equal(
			await days.last().getAttribute("aria-expanded"),
			"true",
			"A chart selection opens the matching day",
		);
		await positions.last().hover();
		assert.equal(
			await days.last().getAttribute("aria-expanded"),
			"true",
			"Hover previews without changing the pinned diary day",
		);
		await action(page, "Ver sesiones del día seleccionado").click();
		assert(await days.last().evaluate((el) => el === document.activeElement));
		await positions.last().click();
		assert.equal(await positions.last().getAttribute("aria-pressed"), "true");
		await screenshot(page, "position-chart");
	});
	await check("history-runs", async (page) => {
		await page.goto(`${url}?history=runs`, {
			waitUntil: "domcontentloaded",
			timeout: 60000,
		});
		await page.getByRole("heading", { name: "Historial de lectura" }).waitFor();
		await page
			.getByRole("combobox", { name: "Tus lecturas", exact: true })
			.focus();
		await action(page, "Eliminar lectura 4").click();
		await page.getByRole("dialog", { name: "Eliminar lectura" }).waitFor();
	});
	await check("tracking", async (page) => {
		await page.clock.install();
		await open(page);
		await trigger(page).click();
		await action(page, "Iniciar sesión").click();
		await action(page, "Pausar").waitFor();
		await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
		await page.clock.runFor(2000);
		const start = await seconds(page);
		for (let tick = 1; tick <= 3; tick++) {
			await page.clock.runFor(1000);
			assert.equal(
				await seconds(page),
				start + tick,
				"Timer must advance every second",
			);
			assert.equal(
				await page
					.locator('[data-reading-controls] p[aria-live="off"]')
					.innerText(),
				await page
					.locator('[data-reading-controls] p[aria-live="off"]')
					.innerText(),
			);
		}
		await page.evaluate(() => {
			window.readingTestPosition = 0.4;
		});
		await page.clock.runFor(1000);
		assert.equal(
			(await page.locator("dd[aria-live=off]").innerText()).replace(/\D/g, ""),
			"1000",
		);
		await page.evaluate(() => {
			window.readingTestPosition = 0.75;
		});
		await page.clock.runFor(1000);
		assert.equal(
			(await page.locator("dd[aria-live=off]").innerText()).replace(/\D/g, ""),
			"1000",
			"Detected jump must not count characters",
		);
		await page.clock.runFor(7000);
		await flushed(page);
		const uploads = await page.evaluate(() => window.readingTestUploads);
		assert(
			uploads.some((row) =>
				row.segments.some((segment) => segment.seconds > 0),
			),
			"Uploads must include elapsed reading seconds",
		);
		const jumpUploaded = uploads.some((row) =>
			row.segments.some((segment) => segment.kind === "jump"),
		);
		if (!jumpUploaded) {
			failures.push(
				"Detected jump excluded from character total but not tagged in uploaded segments",
			);
			console.error(
				"JUMP_SEGMENTS",
				JSON.stringify(
					uploads
						.flatMap((row) => row.segments)
						.map(({ startPosition, endPosition, kind, seconds }) => ({
							startPosition,
							endPosition,
							kind,
							seconds,
						})),
				),
			);
		}
		console.log(
			"TRACKING",
			JSON.stringify({
				start,
				seconds: await seconds(page),
				characters: 1000,
				jumpUploaded,
			}),
		);
		await action(page, "Pausar").click();
		const paused = await seconds(page);
		await page.clock.runFor(60000);
		assert.equal(await seconds(page), paused, "Pause must freeze seconds");
		await action(page, "Reanudar").click();
		await page.clock.runFor(2000);
		assert.equal(
			await seconds(page),
			paused + 2,
			"Resume must advance seconds",
		);
		await flushed(page);
		await page.context().setOffline(true);
		await page.clock.runFor(12000);
		const queued = await records(page);
		assert(
			queued.some(
				(row) =>
					row.revision !== row.acknowledgedRevision && row.segments.length > 0,
			),
			"Offline segments must persist",
		);
		await page.context().setOffline(false);
		await flushed(page);
		const acknowledged = await records(page);
		assert.equal(acknowledged.length, 1, "Active lifecycle record must remain");
		assert.equal(acknowledged[0].state, "active");
		console.log(
			"OUTBOX",
			JSON.stringify({
				queued: queued.map((r) => ({
					revision: r.revision,
					acknowledgedRevision: r.acknowledgedRevision,
					segments: r.segments.length,
				})),
				flushed: acknowledged.map((r) => ({
					state: r.state,
					revision: r.revision,
					acknowledgedRevision: r.acknowledgedRevision,
					segments: r.segments.length,
				})),
			}),
		);
		await action(page, "Pausar").click();
		const longPause = await seconds(page);
		await page.clock.fastForward(31 * 60000);
		await page.keyboard.press("Escape");
		await page
			.getByRole("heading", { name: "El nombre del viento", exact: true })
			.click();
		await page.keyboard.press("ArrowRight");
		await page.clock.runFor(2000);
		assert.equal(
			await seconds(page),
			longPause,
			"Activity after 31 minutes must not restart a manual pause",
		);
		await trigger(page).click();
		await action(page, "Reanudar").waitFor();
		console.log(
			"PAUSE",
			JSON.stringify({
				shortPauseSeconds: paused,
				longPauseSeconds: longPause,
				elapsedMinutes: 31,
			}),
		);
		await screenshot(page, "tracking");
	});

	await check("reader-history", async (page) => {
		await page.clock.install();
		await open(page);
		await trigger(page).click();
		await action(page, "Iniciar sesión").click();
		await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
		await page.clock.runFor(12000);
		await action(page, "Ver historial del libro").click();
		const history = page.getByRole("dialog", {
			name: "Historial de lectura",
			exact: true,
		});
		await history.waitFor();
		await history.getByRole("heading", { name: "Diario de lectura" }).waitFor();
		await page.keyboard.press("Escape");
		await page.clock.runFor(500);
		await history.waitFor({ state: "hidden" });
		await trigger(page).click();
		await page.getByText("Pausado por ti", { exact: true }).first().waitFor();
		await action(page, "Reanudar").click();
		await page.clock.runFor(3000);
		await action(page, "Terminar sesión").click();
		await page.getByText("Sesión sincronizada con tu historial.").waitFor();
		const finished = await seconds(page);
		await page.clock.runFor(5000);
		assert.equal(await seconds(page), finished);
		await screenshot(page, "finished-summary");
		await action(page, "Descartar sesión").click();
		await action(page, "Descartar sesión").waitFor({ state: "hidden" });
		await page.clock.runFor(12000);
		assert.equal(
			(await records(page)).length,
			0,
			"Discarded sessions must not be requeued",
		);
	});

	await check("layout-keyboard", async (page) => {
		await open(page);
		await action(page, "Tiempo").click();
		assert.equal(
			(await trigger(page).locator("span[aria-hidden]").innerText()).trim(),
			"Iniciar",
			"Header must display the tracking state",
		);
		await trigger(page).focus();
		await page.keyboard.press("Enter");
		await action(page, "Iniciar sesión").focus();
		await page.keyboard.press("Enter");
		await action(page, "Pausar").focus();
		await page.keyboard.press("Space");
		await action(page, "Reanudar").waitFor();
		await page.keyboard.press("Escape");
		assert(
			await trigger(page).evaluate((el) => el === document.activeElement),
			"Popover must restore focus",
		);
		for (const scale of [1, 2]) {
			await page.evaluate((scale) => {
				document.documentElement.style.fontSize = `${scale * 100}%`;
			}, scale);
			for (const width of [320, 375, 768, 1440]) {
				await page.setViewportSize({ width, height: 900 });
				await screenshot(page, `${width}-text-${scale * 100}`);
				const overflow = await page.evaluate(() => ({
					width: innerWidth,
					scrollWidth: document.documentElement.scrollWidth,
					elements: Array.from(
						document.querySelectorAll("main fieldset, main select"),
					)
						.filter((el) => {
							const r = el.getBoundingClientRect();
							return r.width && (r.right > innerWidth + 1 || r.left < -1);
						})
						.map((el) => ({
							tag: el.tagName,
							text: el.textContent?.slice(0, 80),
							class: el.getAttribute("class"),
							right: el.getBoundingClientRect().right,
						})),
				}));
				if (overflow.scrollWidth > width) {
					failures.push(
						`History overflow at ${width}, text ${scale * 100}%: ${JSON.stringify(overflow)}`,
					);
					console.error("OVERFLOW", JSON.stringify(overflow));
				}
				await trigger(page).focus();
				await page.keyboard.press("Enter");
				await action(page, "Reanudar").waitFor();
				await screenshot(page, `${width}-text-${scale * 100}-session`);
				const bounds = await action(page, "Reanudar").evaluate((el) => {
					const rect = el.getBoundingClientRect();
					return { left: rect.left, right: rect.right, width: innerWidth };
				});
				assert(
					bounds.left >= 0 && bounds.right <= bounds.width,
					`Session action clipped at ${width}, text ${scale * 100}%`,
				);
				const sessionOverflow = await page.evaluate(
					() => document.documentElement.scrollWidth > innerWidth,
				);
				assert(
					await page
						.getByRole("dialog")
						.evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1),
					"Session panel must not clip its contents horizontally",
				);
				if (sessionOverflow)
					failures.push(
						`Session document overflow at ${width}, text ${scale * 100}%`,
					);
				if (width < 768) {
					for (let tab = 0; tab < 8; tab++) {
						await page.keyboard.press("Tab");
						await page.waitForTimeout(50);
						assert(
							await page.evaluate(() =>
								Boolean(document.activeElement?.closest('[role="dialog"]')),
							),
							"Mobile dialog must trap keyboard focus",
						);
					}
				}
				await page.keyboard.press("Escape");
				await page.getByRole("dialog").waitFor({ state: "hidden" });
				assert(
					await trigger(page).evaluate((el) => el === document.activeElement),
					"Session must restore keyboard focus",
				);
				console.log(
					"LAYOUT",
					JSON.stringify({
						width,
						textPercent: scale * 100,
						historyOverflow: overflow.scrollWidth > width,
						sessionOverflow,
						keyboard: true,
					}),
				);
			}
		}
		await page.evaluate(() => {
			document.documentElement.style.fontSize = "";
		});
		// A 1440px-wide window at 200% browser zoom has a 720 CSS-pixel layout viewport.
		await page.setViewportSize({ width: 720, height: 450 });
		await trigger(page).click();
		await action(page, "Reanudar").waitFor();
		await screenshot(page, "zoom-200-equivalent");
		assert(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		);
		await page.keyboard.press("Escape");
		await page.getByRole("dialog").waitFor({ state: "hidden" });
		await action(page, "Añadir sesión").focus();
		await page.keyboard.press("Enter");
		await page.getByRole("dialog").waitFor();
		await page.keyboard.press("Escape");
		await page.getByRole("dialog").waitFor({ state: "hidden" });
		assert(
			await action(page, "Añadir sesión").evaluate(
				(el) => el === document.activeElement,
			),
		);
		console.log(
			"KEYBOARD header icon, Enter start, Space pause, modal Tab trap, Escape/focus restoration; zoom-equivalent 720x450",
		);
	});

	await check("reader-toolbar", async (page) => {
		await page.goto(`${url}?toolbar=full`, { waitUntil: "domcontentloaded" });
		await page.getByRole("heading", { name: "Diario de lectura" }).waitFor();
		await page.locator("[data-reader-point-actions]").evaluate((toolbar) => {
			for (const label of ["Save point", "Go to point", "Use selection"]) {
				const button = document.createElement("button");
				button.className = "size-10 shrink-0";
				button.setAttribute("aria-label", label);
				toolbar.append(button);
			}
		});
		for (const scale of [1, 2]) {
			await page.evaluate((scale) => {
				document.documentElement.style.fontSize = `${scale * 100}%`;
			}, scale);
			for (const width of [320, 375, 768, 1440]) {
				await page.setViewportSize({ width, height: 900 });
				const bounds = await page
					.locator("[data-reader-header] button:visible")
					.evaluateAll((buttons) =>
						buttons.map((button) => {
							const r = button.getBoundingClientRect();
							return {
								left: r.left,
								right: r.right,
								top: r.top,
								bottom: r.bottom,
							};
						}),
					);
				assert(
					bounds.every((r) => r.left >= 0 && r.right <= width),
					`All reader actions must fit at ${width}, text ${scale * 100}%`,
				);
				for (let i = 0; i < bounds.length; i++)
					for (let j = i + 1; j < bounds.length; j++) {
						const a = bounds[i];
						const b = bounds[j];
						assert(
							Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 ||
								Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1,
							"Reader controls must not overlap",
						);
					}
			}
		}
	});

	await check("two-tab-crash", async (page) => {
		await open(page);
		await trigger(page).click();
		await action(page, "Iniciar sesión").click();
		await page.waitForFunction(() =>
			window.readingTestUploads.some((row) => row.segments.length > 0),
		);
		await flushed(page);
		const [active] = await records(page);
		assert(
			(await seconds(page)) >= 9,
			"Real Chromium wall-time must advance the timer",
		);
		const second = await page.context().newPage();
		await open(second);
		await trigger(second).click();
		assert(
			await action(second, "Iniciar sesión").isDisabled(),
			"Second tab must not record concurrently",
		);
		const locks = await second.evaluate(() => navigator.locks.query());
		assert.equal(
			locks.held?.filter((lock) => lock.name === "nanahoshi-reading:preview")
				.length,
			1,
		);
		console.log("OWNERSHIP", JSON.stringify(locks));
		// Renderer crash, not a graceful close: acknowledged active records need orphan finalization.
		const cdp = await page.context().newCDPSession(page);
		const crashed = page.waitForEvent("crash");
		void cdp.send("Page.crash").catch(() => {});
		await crashed;
		console.log(
			"POST_CRASH_LOCKS",
			JSON.stringify(await second.evaluate(() => navigator.locks.query())),
		);
		await second
			.waitForFunction(() =>
				window.readingTestUploads.some((row) => row.state === "finished"),
			)
			.catch(async (error) => {
				console.log(
					"CRASH_DIAGNOSTIC",
					JSON.stringify({
						records: await records(second),
						uploads: await second.evaluate(() => window.readingTestUploads),
						locks: await second.evaluate(() => navigator.locks.query()),
					}),
				);
				throw error;
			});
		const recovered = await second.evaluate(() => window.readingTestUploads);
		const finished = recovered.find(
			(row) => row.id === active.id && row.state === "finished",
		);
		assert(finished, "Surviving tab must finalize the crashed lifecycle");
		assert(finished.revision > active.revision);
		assert(
			!(await records(second)).some((row) => row.id === active.id),
			"Finished acknowledged orphan must be removed",
		);
		await action(second, "Iniciar sesión").click();
		await action(second, "Pausar").waitFor();
		console.log(
			"CRASH",
			JSON.stringify({
				oldRevision: active.revision,
				finishedRevision: finished.revision,
				endedAt: finished.endedAt,
				survivorCanStart: true,
			}),
		);
	});

	await check("hidden-emulated", async (page) => {
		// Headless Chromium does not hide pages on bringToFront/minimize. Emulate only
		// visibility; ownership, lifecycle locks, storage and both React trees are real.
		await open(page);
		await trigger(page).click();
		await action(page, "Iniciar sesión").click();
		await flushed(page);
		const [active] = await records(page);
		const second = await page.context().newPage();
		await open(second);
		await trigger(second).click();
		assert(await action(second, "Iniciar sesión").isDisabled());
		await page.evaluate(() => {
			Object.defineProperty(document, "visibilityState", {
				configurable: true,
				value: "hidden",
			});
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await page.waitForFunction(
			(prefix) =>
				Object.keys(localStorage)
					.filter((key) => key.startsWith(prefix))
					.some(
						(key) =>
							JSON.parse(localStorage.getItem(key) ?? "null").state ===
							"paused",
					),
			prefix,
		);
		await action(second, "Iniciar sesión").click();
		await action(second, "Pausar").waitFor();
		const paused = await seconds(page);
		await page.waitForTimeout(2100);
		assert.equal(
			await seconds(page),
			paused,
			"Hidden owner must freeze seconds",
		);
		assert.equal(
			(await records(second)).find((row) => row.id === active.id)?.state,
			"paused",
			"Survivor must not finalize a hidden live tab",
		);
		await page.evaluate(() => {
			delete (document as Partial<Document>).visibilityState;
			document.dispatchEvent(new Event("visibilitychange"));
		});
		assert(
			await action(page, "Reanudar").isDisabled(),
			"Returning tab must wait for current owner",
		);
		await second.evaluate(() => {
			Object.defineProperty(document, "visibilityState", {
				configurable: true,
				value: "hidden",
			});
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await action(page, "Reanudar").click();
		await action(page, "Pausar").waitFor();
		console.log(
			"HIDDEN_EMULATED",
			JSON.stringify({
				frozenSeconds: paused,
				hiddenLifecyclePreserved: true,
				ownershipReturned: true,
			}),
		);
	});
} finally {
	await browser.close();
}
if (failures.length) throw new Error(failures.join("\n"));
console.log("All reading-session Chromium checks passed");
