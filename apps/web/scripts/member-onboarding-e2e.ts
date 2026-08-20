import { chromium } from "playwright-core";

const baseUrl = process.env.MEMBER_E2E_BASE_URL ?? "http://localhost:3001";
const inviteCode = process.env.MEMBER_E2E_INVITE_CODE;
const executablePath = process.env.MEMBER_E2E_BROWSER;
const allowRemote = process.env.MEMBER_E2E_ALLOW_REMOTE === "disposable-only";

if (!inviteCode) throw new Error("MEMBER_E2E_INVITE_CODE must be set");
if (!executablePath) throw new Error("MEMBER_E2E_BROWSER must be set");
const target = new URL(baseUrl);
if (
	!["localhost", "127.0.0.1", "::1"].includes(target.hostname) &&
	!allowRemote
) {
	throw new Error(
		"Refusing to mutate a remote server. Set MEMBER_E2E_ALLOW_REMOTE=disposable-only only for an ephemeral deployment.",
	);
}

const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
let accountCreated = false;

try {
	await page.goto(`${baseUrl}/invite/${inviteCode}`, {
		waitUntil: "domcontentloaded",
	});
	await page
		.getByRole("link", { name: /create account|crear cuenta/i })
		.click();
	await page.locator('input[name="name"]').fill("New Member");
	await page.locator('input[name="username"]').fill(`member_${suffix}`);
	await page
		.locator('input[name="email"]')
		.fill(`member-${suffix}@example.com`);
	await page.locator('input[name="password"]').fill("member-test-password");
	await page.locator('button[type="submit"]').click();
	accountCreated = true;
	await page.waitForURL((url) => url.pathname.startsWith("/invite/"));
	await page.getByRole("button", { name: /join|unirse|参加/i }).click();
	await page.waitForURL((url) => url.pathname === "/dashboard");

	// A baseline member must reach the catalog but never receive server-admin
	// controls. This catches both failed membership assignment and privilege leaks.
	await page.getByRole("main").waitFor();

	// Verify a baseline member capability through a real mutation, rather than
	// inferring permissions from localized copy being absent.
	await page.goto(`${baseUrl}/dashboard/collections`, {
		waitUntil: "networkidle",
	});
	await page
		.getByRole("button", {
			name: /new collection|nueva colección|新しいコレクション/i,
		})
		.click();
	await page
		.getByLabel(/collection name|nombre de la colección|コレクション名/i)
		.fill(`E2E ${suffix}`);
	await page.getByRole("button", { name: /create|crear|作成/i }).click();
	await page.getByText(`E2E ${suffix}`, { exact: true }).waitFor();

	// Owner-only controls must not be exposed anywhere in the member shell.
	const forbiddenControls = page.getByText(
		/instance activity|actividad de instancia|delete server|eliminar servidor/i,
	);
	if (await forbiddenControls.count()) {
		throw new Error("A new member can see instance-owner controls");
	}
} finally {
	try {
		if (accountCreated) {
			const cleanup = await page.request.post(
				`${baseUrl}/api/auth/delete-user`,
				{
					data: {},
				},
			);
			if (!cleanup.ok()) {
				console.error(`E2E account cleanup failed (${cleanup.status()})`);
				process.exitCode = 1;
			}
		}
	} finally {
		await browser.close();
	}
}
