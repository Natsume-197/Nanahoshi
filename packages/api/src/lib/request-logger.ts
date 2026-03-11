import { logger } from "./logger";
import type { MiddlewareHandler } from "hono";

/**
 * Structured HTTP request logger middleware using pino.
 *
 * Logs every request as a JSON object with:
 *   - method, url, status, latency (ms), route
 *
 * Output example:
 *   {"level":30,"time":...,"method":"GET","url":"/rpc/books.listRecent","status":200,"latencyMs":12}
 */
export const pinoRequestLogger = (): MiddlewareHandler => {
	return async (c, next) => {
		const start = Date.now();
		const { method } = c.req;
		const url = c.req.url;

		await next();

		const status = c.res.status;
		const latencyMs = Date.now() - start;

		const logFn =
			status >= 500
				? logger.error.bind(logger)
				: status >= 400
					? logger.warn.bind(logger)
					: logger.info.bind(logger);

		logFn({ method, url, status, latencyMs }, `${method} ${new URL(url).pathname} ${status}`);
	};
};
