import type { Hono } from "hono";

export type WebHandler = (request: Request) => Promise<Response>;

// API misses must remain API 404s instead of becoming SSR pages.
const API_PATH =
	/^\/(?:api|rpc|api-reference|ws|stream|read|download|download-series|backups|opds|health|admin\/queues)(?:\/|$)/;

export function mountWebApp(app: Hono, fetchWeb: WebHandler) {
	app.notFound((c) => {
		if (API_PATH.test(c.req.path)) return c.text("Not Found", 404);
		return fetchWeb(c.req.raw);
	});
}
