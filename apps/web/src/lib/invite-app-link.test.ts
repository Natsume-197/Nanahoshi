import { expect, test } from "bun:test";

import { inviteAppLink, isPhoneBrowser } from "./invite-app-link";

test("carries the API origin, the code and the page to fall back to", () => {
	const url = new URL(
		inviteAppLink({
			server: "https://api.books.example",
			code: "aB3xY9",
			link: "https://books.example/invite/aB3xY9",
		}),
	);
	expect(url.protocol).toBe("nanahoshi:");
	expect(url.searchParams.get("server")).toBe("https://api.books.example");
	expect(url.searchParams.get("code")).toBe("aB3xY9");
	expect(url.searchParams.get("link")).toBe(
		"https://books.example/invite/aB3xY9",
	);
});

test("offers the app only on phones", () => {
	expect(
		isPhoneBrowser(
			"Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36",
		),
	).toBe(true);
	expect(
		isPhoneBrowser(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
		),
	).toBe(true);
	expect(
		isPhoneBrowser(
			"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
		),
	).toBe(false);
});
