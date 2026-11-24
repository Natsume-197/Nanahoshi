import { describe, expect, test } from "bun:test";
import { createSafeModeHandler, pickLocale } from "../safe-mode";

const state = {
	code: "database-newer" as const,
	release: "v1.2.0",
	since: new Date("2026-11-24T12:00:00Z"),
	retryAt: new Date("2026-11-24T13:00:00Z"),
};

describe("safe mode", () => {
	const handle = createSafeModeHandler(state);

	test("fails the health check with what happened", async () => {
		const response = handle(new Request("http://nanahoshi/health"));
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			safeMode: true,
			code: "database-newer",
			release: "v1.2.0",
			since: "2026-11-24T12:00:00.000Z",
			retryAt: "2026-11-24T13:00:00.000Z",
		});
	});

	test("answers pages in the visitor's language", async () => {
		const response = handle(
			new Request("http://nanahoshi/", {
				headers: { "Accept-Language": "es-CO,es;q=0.9" },
			}),
		);
		expect(response.status).toBe(503);
		const html = await response.text();
		expect(html).toContain("Nanahoshi no se inició");
		expect(html).toContain("v1.2.0");
	});

	test("falls back to English", () => {
		expect(pickLocale(null)).toBe("en");
		expect(pickLocale("fr-FR,de;q=0.5")).toBe("en");
		expect(pickLocale("ja")).toBe("ja");
	});
});
