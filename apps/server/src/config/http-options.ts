import { MAX_UPLOAD_REQUEST_BYTES } from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";

/**
 * Bun rejects oversized bodies before Hono can add CORS headers or a JSON
 * error. Keep its transport limit above the validated multipart upload limit.
 */
export function withHttpRequestLimits<T extends Record<string, unknown>>(
	options: T,
): T & { maxRequestBodySize: number } {
	return {
		...options,
		maxRequestBodySize: MAX_UPLOAD_REQUEST_BYTES,
	};
}
