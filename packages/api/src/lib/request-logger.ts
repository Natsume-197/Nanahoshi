import type { MiddlewareHandler } from "hono";
import { logger } from "./logger";

export const pinoRequestLogger = (): MiddlewareHandler => {
	return async (c, next) => {
		const start = Date.now();
		const { method } = c.req;
		// Path only — the full URL leaks signed query params (e.g. ?sig=) into logs.
		const path = new URL(c.req.url).pathname;

		await next();

		const status = c.res.status;
		const latencyMs = Date.now() - start;

		const logFn =
			status >= 500
				? logger.error.bind(logger)
				: status >= 400
					? logger.warn.bind(logger)
					: logger.info.bind(logger);

		logFn({ method, path, status, latencyMs }, `${method} ${path} ${status}`);
	};
};
