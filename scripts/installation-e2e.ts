import assert from "node:assert/strict";
import { chmod } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.INSTALLATION_E2E_URL;
const executablePath = process.env.INSTALLATION_E2E_BROWSER;
const statePath = process.env.INSTALLATION_E2E_STATE;
const verify = process.env.INSTALLATION_E2E_PHASE === "verify";
if (
	!baseUrl ||
	!executablePath ||
	!statePath ||
	process.env.INSTALLATION_E2E_DISPOSABLE !== "yes"
) {
	throw new Error(
		"Set INSTALLATION_E2E_URL, BROWSER, STATE and DISPOSABLE=yes for an isolated test installation",
	);
}
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
	locale: "en-US",
	...(verify ? { storageState: statePath } : {}),
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const appOrigin = new URL(baseUrl).origin;
try {
	if (!verify) {
		const status = await context.request.post(
			`${baseUrl}/rpc/setup/ssoStatus`,
			{ data: { json: {} } },
		);
		assert.equal(
			(await status.json()).json.configured,
			false,
			"Refusing to alter an already configured installation",
		);
		await page.goto(baseUrl);
		await page.waitForURL(/\/setup\/?$/);
		await page.locator("#name").fill("Installation Test");
		await page.locator('form button[type="button"]').click();
		await page.locator("#username").fill("installation_admin");
		await page.locator("#email").fill("installation@example.com");
		const password = `Installation-${crypto.randomUUID()}`;
		await page.locator("#password").fill(password);
		await page.locator("#password-repeat").fill(password);
		await page.locator('button[type="submit"]').click();
		await page.waitForURL(/\/dashboard\/?$/, { timeout: 30_000 });
		const signedOut = await page.evaluate(() =>
			fetch("/api/auth/sign-out", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			}).then((response) => response.ok),
		);
		assert.ok(signedOut, "Sign-out must succeed");
		await page.goto(`${baseUrl}/login`);
		await page.locator('input[name="email"]').fill("installation@example.com");
		await page.locator('input[name="password"]').fill(password);
		await page.locator('button[type="submit"]').click();
		await page.waitForURL(/\/dashboard\/?$/, { timeout: 30_000 });
	} else {
		await page.goto(`${baseUrl}/dashboard`);
		await page.waitForURL(/\/dashboard\/?$/);
	}
	await page.getByRole("main").waitFor();
	const session = await context.request.get(`${baseUrl}/api/auth/get-session`);
	const sessionData = await session.json();
	assert.equal(sessionData.user.role, "admin");
	const cookies = await context.cookies();
	const token = cookies.find((cookie) => cookie.name.endsWith("session_token"));
	assert.ok(token, "Browser must retain the authentication cookie");
	assert.equal(token.secure, new URL(baseUrl).protocol === "https:");
	assert.equal(token.httpOnly, true);

	const websocketWorks = await page.evaluate(
		() =>
			new Promise<boolean>((resolve) => {
				const url = new URL("/ws", location.origin);
				url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
				const socket = new WebSocket(url);
				const timer = setTimeout(() => {
					socket.close();
					resolve(false);
				}, 10_000);
				socket.onopen = () => {
					clearTimeout(timer);
					socket.close();
					resolve(true);
				};
				socket.onerror = () => {
					clearTimeout(timer);
					resolve(false);
				};
			}),
	);
	assert.ok(
		websocketWorks,
		"Authenticated WebSocket must open on the application's port",
	);
	if (!verify) {
		for (const libraryPath of ["/books", "/app/apps/server/data/books"]) {
			const created = await context.request.post(
				`${baseUrl}/rpc/libraries/createLibrary`,
				{
					data: {
						json: {
							name:
								libraryPath === "/books" ? "Scanned Books" : "Uploaded Books",
							paths: [libraryPath],
							metadataProviders: ["ranobedb"],
							realtimeWatchEnabled: false,
						},
					},
				},
			);
			const body = await created.json();
			assert.equal(created.status(), 200, JSON.stringify(body));
			if (libraryPath === "/books") continue;
			await page.goto(`${baseUrl}/dashboard/libraries/${body.json.uuid}`);
			await page.getByRole("button", { name: "Create", exact: true }).click();
			await page.getByRole("menuitem", { name: "Upload", exact: true }).click();
			await page.locator("#upload-library").click();
			await page
				.getByRole("option", { name: "Uploaded Books", exact: true })
				.click();
			await page
				.locator('input[type="file"]')
				.setInputFiles(path.join(import.meta.dir, "fixtures/upload.epub"));
			const uploadResponse = page.waitForResponse(
				(response) =>
					response.url().endsWith("/upload") &&
					response.request().method() === "POST",
			);
			await page
				.getByRole("dialog")
				.getByRole("button", { name: "Upload (1)", exact: true })
				.click();
			const uploaded = await uploadResponse;
			assert.equal(uploaded.status(), 200, await uploaded.text());
			assert.deepEqual((await uploaded.json()).uploaded, ["upload.epub"]);
		}
	}
	for (const title of ["Installation Fixture", "Uploaded Fixture"]) {
		const deadline = Date.now() + 120_000;
		let book: { uuid: string; title: string; cover: string } | undefined;
		while (Date.now() < deadline) {
			const response = await context.request.post(
				`${baseUrl}/rpc/books/listAll`,
				{
					data: { json: {} },
				},
			);
			const books = (await response.json()).json;
			book = books.find((item: { title: string }) => item.title === title);
			if (book?.cover) break;
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
		assert.ok(
			book?.cover,
			`Worker must process ${title} and extract its cover`,
		);
		const cover = await context.request.get(
			`${baseUrl}/api/data/covers/${book.cover.split("/").pop()}`,
		);
		assert.equal(cover.status(), 200);
		const signed = await context.request.post(
			`${baseUrl}/rpc/files/getReaderUrl`,
			{
				data: {
					json: {
						uuid: book.uuid,
						serverId: sessionData.session.activeOrganizationId,
					},
				},
			},
		);
		const readerUrl = (await signed.json()).json.url;
		assert.equal(new URL(readerUrl).origin, appOrigin);
		const content = await context.request.get(readerUrl);
		assert.equal(content.status(), 200);
		assert.ok((await content.body()).length > 100);
	}
	await page.goto(`${baseUrl}/dashboard`);
	await page.reload();
	await page.waitForURL(/\/dashboard\/?$/);
	assert.deepEqual(errors, [], "Client must hydrate without JavaScript errors");
	const scriptUrls = await page
		.locator("script[src]")
		.evaluateAll((scripts) =>
			scripts.map((script) => (script as HTMLScriptElement).src),
		);
	assert.ok(
		scriptUrls.some((url) => url.startsWith(`${appOrigin}/assets/`)),
		"Assets must use the public origin",
	);
	await context.storageState({ path: statePath });
	await chmod(statePath, 0o600);
	console.log(
		`Installation browser check passed: ${verify ? "restored session" : "setup"}, login/session, scan, upload, covers, downloads, hydration, WebSocket`,
	);
} finally {
	await browser.close();
}
