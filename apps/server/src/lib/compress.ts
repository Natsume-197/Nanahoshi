import type { MiddlewareHandler } from "hono";

// Bun lacks hono/compress support pre-1.1 and never compresses on its own, so
// text responses (oRPC JSON, OPDS XML, docs HTML) are gzipped here. Binary
// media (covers, audio ranges, epub downloads) and SSE are excluded by type.
const COMPRESSIBLE_TYPES =
	/^(?:text\/(?!event-stream)|application\/(?:json|javascript|xml|atom\+xml|xhtml\+xml)|image\/svg)/;
const MIN_BYTES = 1024;

export function compressResponses(): MiddlewareHandler {
	return async (c, next) => {
		await next();
		const res = c.res;
		if (c.req.method === "HEAD" || !res.body) return;
		if (res.status === 204 || res.status === 304) return;
		if (res.headers.has("content-encoding")) return;
		if (/no-transform/.test(res.headers.get("cache-control") ?? "")) return;
		if (!COMPRESSIBLE_TYPES.test(res.headers.get("content-type") ?? "")) {
			return;
		}
		const length = Number(res.headers.get("content-length"));
		if (!Number.isNaN(length) && length < MIN_BYTES) return;
		if (!/\bgzip\b/.test(c.req.header("accept-encoding") ?? "")) return;

		const headers = new Headers(res.headers);
		headers.delete("content-length");
		headers.set("content-encoding", "gzip");
		if (!/accept-encoding/i.test(headers.get("vary") ?? "")) {
			headers.append("vary", "Accept-Encoding");
		}
		c.res = new Response(res.body.pipeThrough(new CompressionStream("gzip")), {
			status: res.status,
			statusText: res.statusText,
			headers,
		});
	};
}
