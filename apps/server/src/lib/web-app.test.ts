import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { mountWebApp } from "./web-app";

describe("integrated web server", () => {
	const app = new Hono();
	app.get("/health", (c) => c.text("OK"));
	app.get("/api/missing-item", (c) => c.json({ error: "missing" }, 404));
	mountWebApp(
		app,
		async (request) =>
			new Response(`SSR ${new URL(request.url).pathname}`, {
				headers: { "content-type": "text/html" },
			}),
	);

	test("serves the web root and deep links, with a separate health endpoint", async () => {
		for (const route of ["/", "/setup", "/dashboard/books/example"]) {
			const response = await app.request(route);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe(`SSR ${route}`);
		}
		expect(await (await app.request("/health")).text()).toBe("OK");
	});

	test("keeps unknown and explicit API 404s out of SSR", async () => {
		for (const route of [
			"/api/unknown",
			"/rpc/unknown",
			"/ws",
			"/opds/unknown",
			"/stream/unknown",
			"/read/unknown/extra",
			"/download-series/unknown/extra",
			"/backups/unknown",
		]) {
			const response = await app.request(route);
			expect(response.status).toBe(404);
			expect(await response.text()).toBe("Not Found");
		}
		const response = await app.request("/api/missing-item");
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "missing" });
	});
});
