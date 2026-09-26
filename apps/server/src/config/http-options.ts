import { MAX_UPLOAD_REQUEST_BYTES } from "@nanahoshi/api/modules/scanning/supportedExtensions";

// Bun's default of 10s cut uploads off while the server was still storing them
// on a slow disk. 255 is Bun's maximum.
export const HTTP_IDLE_TIMEOUT_SECONDS = 255;

/**
 * Bun rejects oversized bodies before Hono can add CORS headers or a JSON
 * error. Keep its transport limit above the validated upload limit.
 */
export function withHttpRequestLimits<T extends Record<string, unknown>>(
	options: T,
): T & { maxRequestBodySize: number; idleTimeout: number } {
	return {
		...options,
		maxRequestBodySize: MAX_UPLOAD_REQUEST_BYTES,
		idleTimeout: HTTP_IDLE_TIMEOUT_SECONDS,
	};
}
