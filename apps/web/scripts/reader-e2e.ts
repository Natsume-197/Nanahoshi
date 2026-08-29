import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Locator, type Page } from "playwright-core";
import {
	assertMiniplayerTategakiLayout,
	assertZeroPaddingTategakiLayout,
	type ReaderE2ERect,
	type TategakiLayoutSnapshot,
} from "./reader-e2e-layout";

const baseUrl = process.env.READER_E2E_BASE_URL ?? "http://localhost:3001";
const email = process.env.READER_E2E_EMAIL;
const password = process.env.READER_E2E_PASSWORD;
const textBookUuid = process.env.READER_E2E_BOOK_UUID;
const readListenBookUuid = process.env.READER_E2E_READ_LISTEN_BOOK_UUID;
const imageBookUuid = process.env.READER_E2E_IMAGE_BOOK_UUID;
const visualBookUuid = process.env.READER_E2E_VISUAL_BOOK_UUID;
const pdfBookUuid = process.env.READER_E2E_PDF_BOOK_UUID;
const executablePath = process.env.READER_E2E_BROWSER;
const scenarios = new Set(
	(process.env.READER_E2E_SCENARIOS ?? "all")
		.split(",")
		.map((scenario) => scenario.trim())
		.filter(Boolean),
);

interface ReaderProgress {
	current: number;
	total: number;
	percent: number;
}

function required(name: string, value: string | undefined): string {
	if (!value) throw new Error(`${name} must be set to run reader E2E checks.`);
	return value;
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

async function eventually<T>(
	read: () => Promise<T>,
	matches: (value: T) => boolean,
	message: string,
	timeoutMs = 12_000,
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	let lastValue: T | undefined;
	while (Date.now() < deadline) {
		try {
			lastValue = await read();
			if (matches(lastValue)) return lastValue;
		} catch {
			// The renderer may be between mounts while a presentation changes.
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`${message}. Last value: ${JSON.stringify(lastValue)}`);
}

async function waitForReactHydration(page: Page) {
	await page.waitForFunction(
		() => {
			const form = document.querySelector("form");
			return (
				form !== null &&
				Object.keys(form).some((key) => key.startsWith("__reactProps$"))
			);
		},
		undefined,
		{ timeout: 15_000 },
	);
}

async function signIn(page: Page) {
	// Vite keeps a hot-reload connection open in local development, so
	// `networkidle` would make an otherwise healthy login test time out.
	await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
	// React must own the server-rendered form before inputs are filled. On a
	// Vite dev server this takes longer than a fixed delay and submitting early
	// falls back to a native POST instead of exercising the auth client.
	await waitForReactHydration(page);
	const emailInput = page.locator('input[type="email"]');
	const passwordInput = page.locator('input[type="password"]');
	if (scenarios.has("autofill-login")) {
		// Password managers may write DOM values without keyboard/change events.
		// The auth form must still read those values when it is submitted.
		await page.evaluate(
			({ autofillEmail, autofillPassword }) => {
				const emailElement = document.querySelector<HTMLInputElement>(
					'input[name="email"]',
				);
				const passwordElement = document.querySelector<HTMLInputElement>(
					'input[name="password"]',
				);
				if (!emailElement || !passwordElement) {
					throw new Error("Sign-in fields are missing");
				}
				emailElement.value = autofillEmail;
				passwordElement.value = autofillPassword;
			},
			{
				autofillEmail: required("READER_E2E_EMAIL", email),
				autofillPassword: required("READER_E2E_PASSWORD", password),
			},
		);
	} else {
		await emailInput.click();
		await emailInput.press("ControlOrMeta+A");
		await emailInput.pressSequentially(required("READER_E2E_EMAIL", email));
		await passwordInput.click();
		await passwordInput.press("ControlOrMeta+A");
		await passwordInput.pressSequentially(
			required("READER_E2E_PASSWORD", password),
		);
	}
	const submit = page.locator('button[type="submit"]');
	await eventually(
		() => submit.isEnabled(),
		Boolean,
		"The sign-in form did not become submittable",
	);
	await submit.click();
	try {
		await eventually(
			async () => page.url(),
			(url) => new URL(url).pathname === "/dashboard",
			"Sign-in did not reach the dashboard",
		);
		await page.getByRole("main").waitFor({ state: "visible", timeout: 15_000 });
		await page.waitForTimeout(2_000);
		assert(
			new URL(page.url()).pathname === "/dashboard",
			`Sign-in returned to ${new URL(page.url()).pathname}`,
		);
	} catch (error) {
		const alerts = await page.locator('[role="alert"]').allTextContents();
		throw new Error(
			`${error instanceof Error ? error.message : "Sign-in failed"}. Visible alerts: ${alerts.join(" | ") || "none"}`,
		);
	}
}

async function openReader(page: Page, uuid: string, renderer?: string) {
	await page.goto(`${baseUrl}/reader/${uuid}`, {
		waitUntil: "domcontentloaded",
	});
	await page.locator("main.reader-route-content").waitFor({ state: "visible" });
	const selector = renderer
		? `[data-reader-renderer="${renderer}"]`
		: "[data-reader-renderer]";
	await page.locator(selector).first().waitFor({
		state: "visible",
		timeout: 20_000,
	});
}

function progressLocator(page: Page) {
	return page.locator("[data-reader-progress]");
}

async function readProgress(page: Page): Promise<ReaderProgress> {
	return progressLocator(page).evaluate((footer) => ({
		current: Number(footer.getAttribute("data-reader-progress-current")),
		total: Number(footer.getAttribute("data-reader-progress-total")),
		percent: Number(footer.getAttribute("data-reader-progress-percent")),
	}));
}

async function waitForProgress(page: Page) {
	return eventually(
		() => readProgress(page),
		(progress) => Number.isFinite(progress.current) && progress.total > 0,
		"The reader did not publish canonical progress",
	);
}

function assertNearProgress(
	before: ReaderProgress,
	after: ReaderProgress,
	label: string,
	maximumDelta = 8,
) {
	assert(
		Math.abs(before.percent - after.percent) <= maximumDelta,
		`${label} drifted from ${before.percent.toFixed(2)}% to ${after.percent.toFixed(2)}%.`,
	);
}

async function showReaderMenu(page: Page) {
	const showMenu = page.getByRole("button", { name: "Show reader menu" });
	if (await showMenu.isVisible()) await showMenu.click();
}

async function hideReaderMenu(page: Page) {
	const hideMenu = page.getByRole("button", { name: "Hide reader menu" });
	if (await hideMenu.isVisible()) await hideMenu.click();
}

async function openQuickSettings(page: Page) {
	const settingsPanel = page.locator(
		'[aria-labelledby="reader-quick-settings-title"],[aria-labelledby="reader-quick-settings-window-title"]',
	);
	if (!(await settingsPanel.isVisible())) {
		await showReaderMenu(page);
		await page.getByRole("button", { name: "Open Quick Settings" }).click();
	}
	await eventually(
		() => settingsPanel.isVisible(),
		Boolean,
		"Quick settings did not open",
	);
	return settingsPanel;
}

async function closeQuickSettings(page: Page) {
	await page.keyboard.press("Escape");
	await page.waitForTimeout(150);
}

async function openQuickSettingsCategory(
	page: Page,
	category: "Text" | "Layout",
) {
	const drawer = await openQuickSettings(page);
	const back = drawer.getByRole("button", {
		name: "Back to settings categories",
	});
	if (await back.isVisible()) await back.click();
	await drawer.getByRole("button", { name: category, exact: true }).click();
	return drawer;
}

async function switchTextFlow(
	page: Page,
	name: "Continuous" | "Pages" | "Focus",
	renderer: "text-scroll" | "text-paginated" | "text-focus",
) {
	await openQuickSettingsCategory(page, "Layout");
	await page.getByRole("button", { name, exact: true }).click();
	await page.locator(`[data-reader-renderer="${renderer}"]`).waitFor({
		state: "visible",
		timeout: 15_000,
	});
}

async function setPaddingToZero(
	settings: Locator,
	label: "Horizontal padding" | "Vertical padding",
) {
	const fieldset = settings.locator(`fieldset[aria-label="${label}"]`);
	const decrease = fieldset.getByRole("button", { name: "Decrease" });
	for (let step = 0; step <= 30 && (await decrease.isEnabled()); step++) {
		await decrease.click();
	}
	assert(!(await decrease.isEnabled()), `${label} did not reach its minimum.`);
	await eventually(
		() => fieldset.innerText(),
		(text) => text.includes("0%"),
		`${label} did not display 0%`,
	);
}

async function configureZeroPaddingTategaki(page: Page) {
	await switchTextFlow(page, "Pages", "text-paginated");
	const settings = await openQuickSettingsCategory(page, "Text");
	await settings
		.locator('fieldset[aria-label="Text orientation"]')
		.getByRole("button", { name: "Vertical" })
		.click();
	await page.locator('[data-reader-renderer="text-paginated"]').waitFor({
		state: "visible",
		timeout: 15_000,
	});
	await setPaddingToZero(settings, "Horizontal padding");
	await setPaddingToZero(settings, "Vertical padding");
	await closeQuickSettings(page);
	await hideReaderMenu(page);
	await page.waitForTimeout(500);
}

async function readTategakiLayout(page: Page): Promise<TategakiLayoutSnapshot> {
	return page
		.locator('[data-reader-renderer="text-paginated"]')
		.evaluate((surface): TategakiLayoutSnapshot => {
			const route = surface.closest("main.reader-route-content");
			const frame = surface.parentElement;
			if (!(route instanceof HTMLElement) || !(frame instanceof HTMLElement)) {
				throw new Error("Paginated reader geometry nodes were not found.");
			}
			const html = surface.querySelector<HTMLElement>(
				".nanahoshi-book-html-wrapper",
			);
			const body = surface.querySelector<HTMLElement>(
				".nanahoshi-book-body-wrapper",
			);
			if (!html || !body) {
				throw new Error("Publication wrappers were not rendered.");
			}
			const rect = (element: Element): ReaderE2ERect => {
				const value = element.getBoundingClientRect();
				return {
					top: value.top,
					right: value.right,
					bottom: value.bottom,
					left: value.left,
					width: value.width,
					height: value.height,
				};
			};
			const inset = (element: HTMLElement, property: string) =>
				Number.parseFloat(
					getComputedStyle(element).getPropertyValue(property),
				) || 0;

			return {
				viewport: { width: window.innerWidth, height: window.innerHeight },
				route: rect(route),
				frame: rect(frame),
				surface: rect(surface),
				publicationInsets: {
					htmlMarginTop: inset(html, "margin-top"),
					htmlMarginBottom: inset(html, "margin-bottom"),
					htmlPaddingTop: inset(html, "padding-top"),
					htmlPaddingBottom: inset(html, "padding-bottom"),
					bodyMarginTop: inset(body, "margin-top"),
					bodyMarginBottom: inset(body, "margin-bottom"),
					bodyPaddingTop: inset(body, "padding-top"),
					bodyPaddingBottom: inset(body, "padding-bottom"),
				},
			};
		});
}

async function verifyZeroPaddingTategaki(page: Page, uuid: string) {
	for (const viewport of [
		{ width: 1280, height: 900 },
		{ width: 390, height: 844 },
	]) {
		await page.setViewportSize(viewport);
		await openReader(page, uuid);
		await configureZeroPaddingTategaki(page);
		assertZeroPaddingTategakiLayout(await readTategakiLayout(page));
	}
}

async function enableReadListen(page: Page) {
	await showReaderMenu(page);
	const toggle = page.getByRole("button", { name: "Read & Listen" });
	await toggle.waitFor({ state: "visible", timeout: 15_000 });
	if ((await toggle.getAttribute("aria-pressed")) !== "true") {
		await toggle.click();
	}
	await eventually(
		async () => page.url(),
		(url) => new URL(url).searchParams.has("pair"),
		"Read & Listen did not activate",
	);
	await page
		.locator('.read-listen-player-dock[data-player-expanded="false"]')
		.waitFor({ state: "visible", timeout: 20_000 });
	await hideReaderMenu(page);
}

async function verifyMiniplayerTategaki(page: Page, uuid: string) {
	for (const viewport of [
		{ width: 1280, height: 900 },
		{ width: 390, height: 844 },
	]) {
		await page.setViewportSize(viewport);
		await openReader(page, uuid);
		await configureZeroPaddingTategaki(page);
		await enableReadListen(page);
		await page.waitForTimeout(500);
		const snapshot = await readTategakiLayout(page);
		const player = await page
			.locator('.read-listen-player-dock[data-player-expanded="false"]')
			.evaluate((element): ReaderE2ERect => {
				const value = element.getBoundingClientRect();
				return {
					top: value.top,
					right: value.right,
					bottom: value.bottom,
					left: value.left,
					width: value.width,
					height: value.height,
				};
			});
		assertMiniplayerTategakiLayout({ ...snapshot, player });
	}
}

async function scrollSurfaceWithWheel(page: Page, surface: Locator) {
	const box = await surface.boundingBox();
	assert(box, "The reader surface has no visible bounds.");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	for (const delta of [900, 900, -420, 1_100, -280, 720]) {
		await page.mouse.wheel(0, delta);
	}
	await page.waitForTimeout(600);
}

async function verifyContinuousRestoreAndScroll(page: Page, uuid: string) {
	await openReader(page, uuid, "text-scroll");
	const surface = page.locator("main.reader-route-content");
	await waitForProgress(page);
	await surface.evaluate((element) => {
		element.scrollTop = Math.max(
			1,
			(element.scrollHeight - element.clientHeight) * 0.2,
		);
		element.dispatchEvent(new Event("scroll"));
	});
	await page.waitForTimeout(300);
	await scrollSurfaceWithWheel(page, surface);
	const before = await eventually(
		() => readProgress(page),
		(progress) => progress.percent > 1 && progress.percent < 99,
		"Wheel scrolling did not move the canonical reader position",
	);

	await page.reload({ waitUntil: "domcontentloaded" });
	await page.locator('[data-reader-renderer="text-scroll"]').waitFor({
		state: "visible",
		timeout: 20_000,
	});
	const restored = await waitForProgress(page);
	assert(
		restored.current > 0,
		"A restored reader exposed a zero progress counter.",
	);
	assertNearProgress(before, restored, "Continuous restore", 10);
}

async function verifyTextLayoutsAndReflow(page: Page) {
	const initialSettings = await openQuickSettingsCategory(page, "Text");
	await initialSettings
		.locator('fieldset[aria-label="Text orientation"]')
		.getByRole("button", { name: "Horizontal" })
		.click();
	const beforeLayout = await waitForProgress(page);
	await switchTextFlow(page, "Pages", "text-paginated");
	const paginated = await waitForProgress(page);
	assertNearProgress(beforeLayout, paginated, "Continuous to paginated layout");

	const settings = await openQuickSettingsCategory(page, "Layout");
	await settings
		.locator('fieldset[aria-label="Columns"]')
		.getByRole("button", {
			name: "2",
		})
		.click();
	const textSettings = await openQuickSettingsCategory(page, "Text");
	await textSettings
		.locator('fieldset[aria-label="Text size"]')
		.getByRole("button", { name: "Increase" })
		.click();
	await page.setViewportSize({ width: 1120, height: 760 });
	await page.waitForTimeout(900);
	const reflowed = await waitForProgress(page);
	assertNearProgress(paginated, reflowed, "Paginated reflow", 10);
	await textSettings
		.locator('fieldset[aria-label="Text orientation"]')
		.getByRole("button", { name: "Vertical" })
		.click();
	const vertical = await waitForProgress(page);
	assertNearProgress(reflowed, vertical, "Writing-direction reflow", 10);
	await textSettings
		.locator('fieldset[aria-label="Text orientation"]')
		.getByRole("button", { name: "Horizontal" })
		.click();

	await switchTextFlow(page, "Focus", "text-focus");
	const focusBefore = await waitForProgress(page);
	await closeQuickSettings(page);
	await hideReaderMenu(page);
	await page.getByRole("button", { name: "Next sentence" }).click();
	const focusAfter = await eventually(
		() => readProgress(page),
		(progress) => progress.current >= focusBefore.current,
		"Focus did not retain a valid reader position",
	);
	assert(
		focusAfter.current >= focusBefore.current,
		"Focus navigation moved the reader backward.",
	);

	await switchTextFlow(page, "Continuous", "text-scroll");
	const continuous = await waitForProgress(page);
	assertNearProgress(focusAfter, continuous, "Focus to continuous layout", 10);
	await closeQuickSettings(page);
}

async function verifyPaginatedHasNoVerticalDocumentOverflow(
	page: Page,
	uuid: string,
) {
	await page.setViewportSize({ width: 1280, height: 900 });
	await openReader(page, uuid);
	await switchTextFlow(page, "Pages", "text-paginated");
	await page.waitForTimeout(500);

	const readMetrics = () =>
		page.evaluate(() => {
			const route = document.querySelector<HTMLElement>(
				"main.reader-route-content",
			);
			const surface = document.querySelector<HTMLElement>(
				'[data-reader-renderer="text-paginated"]',
			);
			if (!route || !surface) {
				throw new Error("Paginated reader overflow nodes were not found.");
			}
			const frame = surface.parentElement;
			if (!frame) throw new Error("Paginated reader frame was not found.");
			const measure = (element: HTMLElement) => ({
				clientHeight: element.clientHeight,
				scrollHeight: element.scrollHeight,
				overflowY: getComputedStyle(element).overflowY,
			});
			return {
				viewportHeight: window.innerHeight,
				document: measure(document.documentElement),
				body: measure(document.body),
				route: measure(route),
				frame: measure(frame),
				surface: measure(surface),
			};
		});
	const assertNoVerticalOverflow = async (state: string) => {
		const metrics = await readMetrics();
		for (const name of ["document", "body", "route", "frame"] as const) {
			const node = metrics[name];
			assert(
				node.scrollHeight <= node.clientHeight + 1,
				`Paginated mode created vertical ${name} overflow while ${state}: ${JSON.stringify(metrics)}`,
			);
		}
		assert(
			metrics.route.overflowY === "hidden",
			`Paginated route can paint a vertical scrollbar while ${state}: ${JSON.stringify(metrics)}`,
		);
	};

	await assertNoVerticalOverflow("settings are expanded");
	await page.getByRole("button", { name: "Collapse settings window" }).click();
	await assertNoVerticalOverflow("settings are collapsed");
	await page.getByRole("button", { name: "Expand settings window" }).click();
	await closeQuickSettings(page);
	await hideReaderMenu(page);
	await page.waitForTimeout(300);
	await assertNoVerticalOverflow("horizontal settings are closed");

	const textSettings = await openQuickSettingsCategory(page, "Text");
	await textSettings
		.locator('fieldset[aria-label="Text orientation"]')
		.getByRole("button", { name: "Vertical" })
		.click();
	await page.locator('[data-reader-renderer="text-paginated"]').waitFor({
		state: "visible",
		timeout: 15_000,
	});
	await page.waitForTimeout(500);
	await assertNoVerticalOverflow("vertical settings are expanded");
	await closeQuickSettings(page);
	await hideReaderMenu(page);
	await page.waitForTimeout(300);
	await assertNoVerticalOverflow("vertical settings are closed");
}

async function verifyImageRestore(page: Page, uuid: string) {
	await openReader(page, uuid, "text-scroll");
	const image = page
		.locator('[data-reader-renderer="text-scroll"] img')
		.first();
	await image.waitFor({ state: "visible", timeout: 20_000 });
	await image.evaluate((element) => {
		const surface = document.querySelector<HTMLElement>(
			"main.reader-route-content",
		);
		if (!surface) throw new Error("Reader surface was not found.");
		const imageRect = element.getBoundingClientRect();
		const surfaceRect = surface.getBoundingClientRect();
		surface.scrollTop +=
			imageRect.top -
			surfaceRect.top -
			surface.clientHeight / 2 +
			imageRect.height / 2;
		surface.dispatchEvent(new Event("scroll"));
	});
	await page.waitForTimeout(750);

	await page.reload({ waitUntil: "domcontentloaded" });
	await image.waitFor({ state: "visible", timeout: 20_000 });
	const distanceFromCenter = await image.evaluate((element) => {
		const surface = document.querySelector<HTMLElement>(
			"main.reader-route-content",
		);
		if (!surface) return Number.POSITIVE_INFINITY;
		const imageRect = element.getBoundingClientRect();
		const surfaceRect = surface.getBoundingClientRect();
		return Math.abs(
			imageRect.top +
				imageRect.height / 2 -
				(surfaceRect.top + surface.clientHeight / 2),
		);
	});
	const surfaceHeight = await page
		.locator("main.reader-route-content")
		.evaluate((surface) => surface.clientHeight);
	assert(
		distanceFromCenter < surfaceHeight * 0.4,
		`Reopening an image moved the reading position away from its saved point (${distanceFromCenter.toFixed(0)}px from center on a ${surfaceHeight.toFixed(0)}px surface).`,
	);
}

async function verifyVisualReader(page: Page, uuid: string) {
	await openReader(page, uuid, "visual");
	await waitForProgress(page);
	const settings = await openQuickSettingsCategory(page, "Layout");
	const layout = settings.locator("#reader-quick-page-layout");
	await layout.selectOption("single-page");
	await settings
		.locator('fieldset[aria-label="Reading direction"]')
		.getByRole("button", { name: "Western" })
		.click();
	await closeQuickSettings(page);
	await hideReaderMenu(page);
	const visual = page.locator('[data-reader-renderer="visual"]');
	const box = await visual.boundingBox();
	assert(box, "The visual reader has no visible bounds.");
	const beforePage = await waitForProgress(page);
	await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
	const afterPage = await eventually(
		() => readProgress(page),
		(progress) => progress.current > beforePage.current,
		"Single-page visual navigation did not advance",
	);

	const layoutSettings = await openQuickSettingsCategory(page, "Layout");
	const nextLayout = layoutSettings.locator("#reader-quick-page-layout");
	await nextLayout.selectOption("two-page-spread");
	assert(
		(await nextLayout.evaluate(
			(element) => (element as HTMLSelectElement).value,
		)) === "two-page-spread",
		"Visual two-page layout was not selected.",
	);

	await nextLayout.selectOption("vertical-strip");
	await closeQuickSettings(page);
	await hideReaderMenu(page);
	await visual.waitFor({ state: "visible" });
	await scrollSurfaceWithWheel(page, visual);
	const stripPosition = await eventually(
		() => readProgress(page),
		(progress) => progress.current >= afterPage.current,
		"Vertical-strip scrolling did not expose a valid page position",
	);
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.locator('[data-reader-renderer="visual"]').waitFor({
		state: "visible",
		timeout: 20_000,
	});
	const restored = await waitForProgress(page);
	assertNearProgress(stripPosition, restored, "Visual restore", 20);
	await closeQuickSettings(page);
}

function parsePdfPage(text: string) {
	const match = text.match(/(\d+)\s*\/\s*(\d+)/);
	if (!match) throw new Error(`Could not parse PDF page position: ${text}`);
	return { page: Number(match[1]), total: Number(match[2]) };
}

async function readPdfPage(page: Page) {
	return parsePdfPage(
		await page.getByRole("status", { name: "PDF page position" }).innerText(),
	);
}

async function waitForPdfPageCount(
	page: Page,
	requestFailures: readonly string[],
) {
	try {
		return await eventually(
			() => readPdfPage(page),
			(position) => position.total > 0,
			"The PDF reader did not publish its page count",
			45_000,
		);
	} catch (error) {
		const alerts = await page.locator('[role="alert"]').allTextContents();
		const statuses = await page.locator('[role="status"]').allTextContents();
		throw new Error(
			`${error instanceof Error ? error.message : "The PDF reader did not publish its page count"}. Visible alerts: ${alerts.join(" | ") || "none"}. Visible statuses: ${statuses.join(" | ") || "none"}. Failed requests: ${requestFailures.join(" | ") || "none"}.`,
		);
	}
}

async function goToPdfPage(page: Page, targetPage: number) {
	const pageInput = page.getByLabel("Current PDF page");
	await pageInput.fill(String(targetPage));
	await pageInput.press("Enter");
	await eventually(
		() => readPdfPage(page),
		(position) => position.page === targetPage,
		`The PDF reader did not navigate to page ${targetPage}`,
	);
}

async function visiblePdfPage(
	page: Page,
	pageNumber: number,
	pageCount: number,
) {
	const pdfPage = page.getByRole("article", {
		name: `PDF page ${pageNumber} of ${pageCount}`,
	});
	await pdfPage.waitFor({ state: "visible" });
	const box = await pdfPage.boundingBox();
	assert(box, `PDF page ${pageNumber} has no visible bounds.`);
	return box;
}

async function verifyPdf(page: Page, uuid: string) {
	const requestFailures: string[] = [];
	const consoleErrors: string[] = [];
	const recordFailedRequest = (request: {
		url(): string;
		failure(): unknown;
	}) => {
		const url = new URL(request.url());
		requestFailures.push(
			`${url.pathname}: ${JSON.stringify(request.failure() ?? "unknown failure")}`,
		);
	};
	const recordConsoleError = (message: { type(): string; text(): string }) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	};
	page.on("requestfailed", recordFailedRequest);
	page.on("console", recordConsoleError);
	try {
		await openReader(page, uuid, "pdf");
		const initialPosition = await waitForPdfPageCount(page, requestFailures);
		const panButton = page.getByRole("button", { name: "Pan document" });
		const selectButton = page.getByRole("button", { name: "Select PDF text" });

		// Pan is only useful once the document is larger than the viewport. This
		// also makes the test exercise the actual drag path rather than only its
		// toolbar state.
		await page.getByRole("button", { name: "Zoom in" }).click();
		await page.getByRole("button", { name: "Zoom in" }).click();
		// Zoom changes the virtual window asynchronously. Wait for its layout before
		// pointing at a page; otherwise the element can be visible while it still
		// belongs to the previous scroll geometry.
		await page.waitForTimeout(1_200);
		await goToPdfPage(page, Math.min(16, initialPosition.total));
		await page.waitForTimeout(1_200);
		const viewport = page.locator(".nanahoshi-pdf-viewport");
		const panPageNumber = Math.min(16, initialPosition.total);
		const beforePan = await viewport.evaluate((element) => element.scrollTop);
		await panButton.click();
		assert(
			(await panButton.getAttribute("aria-pressed")) === "true",
			"The PDF pan tool did not activate.",
		);
		let panned = false;
		for (let attempt = 0; attempt < 3 && !panned; attempt++) {
			const panPage = await visiblePdfPage(
				page,
				panPageNumber,
				initialPosition.total,
			);
			await page.mouse.move(
				panPage.x + panPage.width / 2,
				panPage.y + panPage.height / 2,
			);
			await page.mouse.down();
			await page.mouse.move(
				panPage.x + panPage.width / 2,
				panPage.y + panPage.height / 2 - 120,
				{ steps: 24 },
			);
			await page.mouse.up();
			panned =
				(await viewport.evaluate((element) => element.scrollTop)) >
				beforePan + 30;
			if (!panned) await page.waitForTimeout(250);
		}
		assert(panned, "Dragging with the PDF pan tool did not move the document");
		await selectButton.click();
		assert(
			(await selectButton.getAttribute("aria-pressed")) === "true",
			"The PDF selection tool did not deactivate pan.",
		);
		// This regression fixture is a scanned PDF. It has no reliable embedded
		// text geometry, so asserting highlighted characters here would turn the
		// reader test into an OCR test. The tool transition itself is still covered;
		// text selection is exercised with a selectable-text fixture separately.
		const before = await readPdfPage(page);
		if (before.page < before.total) {
			await page.getByRole("button", { name: "Next PDF page" }).click();
			await eventually(
				() => readPdfPage(page),
				(position) => position.page === before.page + 1,
				"PDF next-page navigation did not update its position",
			);
		}
		const advanced = await readPdfPage(page);

		await page
			.getByRole("button", { name: "Open PDF presentation settings" })
			.click();
		await page.getByRole("menuitem", { name: "Two page (even)" }).click();
		await page.waitForTimeout(750);
		assert(
			await page.locator(".nanahoshi-pdf-viewport").isVisible(),
			"Changing PDF page layout removed the document viewport.",
		);
		await page
			.getByRole("button", { name: "Open PDF presentation settings" })
			.click();
		await page.getByRole("menuitem", { name: "Horizontal" }).click();
		await page.waitForTimeout(750);
		assert(
			await page.locator(".nanahoshi-pdf-viewport").isVisible(),
			"Changing PDF scroll direction removed the document viewport.",
		);
		assert(
			!consoleErrors.some((message) =>
				message.includes("Maximum update depth exceeded"),
			),
			"Changing the PDF presentation caused a React update loop.",
		);
		await page
			.getByRole("button", { name: "Toggle PDF page navigator" })
			.click();
		const thumbnails = page.locator(
			'aside[aria-label="PDF page navigator"] img',
		);
		await thumbnails.first().waitFor({ state: "visible" });
		assert(
			(await thumbnails.count()) > 0,
			"The PDF page navigator did not render page thumbnails.",
		);
		await page
			.getByRole("button", { name: "Close PDF page navigator" })
			.click();
		await eventually(
			() => page.locator('aside[aria-label="PDF page navigator"]').count(),
			(count) => count === 0,
			"Closing the PDF page navigator left its thumbnail renderer mounted",
		);
		await page.getByRole("button", { name: "Search this PDF" }).click();
		await page.locator('aside[aria-label="Search PDF"]').waitFor({
			state: "visible",
		});
		await page.getByRole("button", { name: "Close PDF search" }).click();
		await page.getByRole("button", { name: "Open PDF reader menu" }).click();
		assert(
			!(await page
				.getByRole("button", { name: "Hide reader menu" })
				.isVisible()),
			"The PDF overflow menu must not open the reader-wide header.",
		);
		await eventually(
			() =>
				page.getByRole("menuitem", { name: "Open Quick Settings" }).isVisible(),
			Boolean,
			"The PDF overflow menu did not open its local actions",
		);
		assert(
			await page.getByRole("menuitem", { name: "Print PDF" }).isEnabled(),
			"PDF printing was not available after the document loaded.",
		);
		assert(
			await page.getByRole("menuitem", { name: "Download PDF" }).isEnabled(),
			"PDF download was not available after the document loaded.",
		);

		// Reader progress is intentionally debounced so a scroll does not write on
		// every frame. Allow the final presentation/navigation update to persist
		// before a reload asserts its restoration.
		await page.waitForTimeout(750);
		await page.reload({ waitUntil: "domcontentloaded" });
		await page.locator('[data-reader-renderer="pdf"]').waitFor({
			state: "visible",
			timeout: 20_000,
		});
		const restored = await eventually(
			() => readPdfPage(page),
			(position) => position.total === advanced.total,
			"PDF did not restore its document state",
			20_000,
		);
		assert(
			Math.abs(restored.page - advanced.page) <= 1,
			`PDF restore drifted from page ${advanced.page} to ${restored.page}.`,
		);
	} finally {
		page.off("requestfailed", recordFailedRequest);
		page.off("console", recordConsoleError);
	}
}

const browserProfile = mkdtempSync(join(tmpdir(), "nanahoshi-reader-e2e-"));
const browser = await chromium.launchPersistentContext(browserProfile, {
	headless: true,
	executablePath: required("READER_E2E_BROWSER", executablePath),
	// PDFium receives range responses and keeps its own decoded-page cache. The
	// browser disk cache is unnecessary here and can fail in ephemeral runners,
	// making a valid PDF look blank before interaction assertions run.
	args: ["--disk-cache-size=0", "--media-cache-size=0"],
});

try {
	const page = await browser.newPage();
	await page.setViewportSize({ width: 1280, height: 900 });
	await signIn(page);
	if (scenarios.has("all") || scenarios.has("text")) {
		const textUuid = required("READER_E2E_BOOK_UUID", textBookUuid);
		await verifyContinuousRestoreAndScroll(page, textUuid);
		await verifyTextLayoutsAndReflow(page);
	}
	if (
		scenarios.has("all") ||
		scenarios.has("text") ||
		scenarios.has("paginated-overflow")
	) {
		await verifyPaginatedHasNoVerticalDocumentOverflow(
			page,
			required("READER_E2E_BOOK_UUID", textBookUuid),
		);
	}
	if (scenarios.has("all") || scenarios.has("tategaki")) {
		await verifyZeroPaddingTategaki(
			page,
			required("READER_E2E_BOOK_UUID", textBookUuid),
		);
	}
	if (scenarios.has("all") || scenarios.has("read-listen-layout")) {
		await verifyMiniplayerTategaki(
			page,
			required("READER_E2E_READ_LISTEN_BOOK_UUID", readListenBookUuid),
		);
	}
	if (scenarios.has("all") || scenarios.has("image")) {
		await verifyImageRestore(
			page,
			required("READER_E2E_IMAGE_BOOK_UUID", imageBookUuid),
		);
	}
	if (scenarios.has("all") || scenarios.has("visual")) {
		await verifyVisualReader(
			page,
			required("READER_E2E_VISUAL_BOOK_UUID", visualBookUuid),
		);
	}
	if (scenarios.has("all") || scenarios.has("pdf")) {
		await verifyPdf(page, required("READER_E2E_PDF_BOOK_UUID", pdfBookUuid));
	}
	console.log("Reader E2E checks passed.");
} finally {
	await browser.close();
	rmSync(browserProfile, { recursive: true, force: true });
}
