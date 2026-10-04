import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const FILE_HEADER = "x-nanahoshi-file";

type Range = { start: number; end: number };

const blobOf = (path: string, range?: Range) =>
	range ? Bun.file(path).slice(range.start, range.end + 1) : Bun.file(path);

/**
 * Responds with a file (or a byte range of it). Bun only sends a known
 * Content-Length for a file blob; Hono rebuilds the Response from its body
 * stream whenever a middleware sets a header afterwards (CORS adds Vary), and
 * a stream goes out chunked, which left download progress at 0%. So the file
 * is marked here and put back by `restoreFileBody` right before sending.
 */
export function sendFile(
	c: Context,
	status: ContentfulStatusCode,
	file: { path: string; range?: Range },
	headers: Record<string, string>,
) {
	return c.body(
		blobOf(file.path, file.range) as unknown as ReadableStream,
		status,
		{
			...headers,
			// Headers are Latin-1 only; paths can be Japanese.
			[FILE_HEADER]: encodeURIComponent(JSON.stringify(file)),
		},
	);
}

/** The last step before Bun sends a response: swap the marked file back in. */
export function restoreFileBody(response: Response): Response {
	const marker = response.headers.get(FILE_HEADER);
	if (!marker) return response;
	const headers = new Headers(response.headers);
	headers.delete(FILE_HEADER);
	if (headers.has("content-encoding")) {
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	}
	const file = JSON.parse(decodeURIComponent(marker)) as {
		path: string;
		range?: Range;
	};
	void response.body?.cancel().catch(() => undefined);
	return new Response(blobOf(file.path, file.range), {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
