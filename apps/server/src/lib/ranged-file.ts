import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Context } from "hono";
import { asBody } from "./node-stream";

export async function serveRangedFile(
	c: Context,
	file: { path: string; mimeType: string; contentDisposition?: string },
) {
	let stats: Awaited<ReturnType<typeof stat>>;
	try {
		stats = await stat(file.path);
	} catch {
		return c.text("File missing on disk", 404);
	}

	const size = stats.size;
	const etag = `"${size}-${Math.floor(stats.mtimeMs)}"`;
	const lastModified = stats.mtime.toUTCString();
	const commonHeaders: Record<string, string> = {
		"Accept-Ranges": "bytes",
		"Cache-Control": "private, max-age=3600, no-transform",
		"Content-Type": file.mimeType,
		ETag: etag,
		"Last-Modified": lastModified,
	};
	if (file.contentDisposition) {
		commonHeaders["Content-Disposition"] = file.contentDisposition;
	}

	if (c.req.header("If-None-Match") === etag) {
		return c.newResponse(null, 304, commonHeaders);
	}

	const ifRange = c.req.header("If-Range");
	const range =
		ifRange && ifRange !== etag && ifRange !== lastModified
			? undefined
			: parseByteRange(c.req.header("Range"), size);

	if (range === "invalid") {
		return c.newResponse(null, 416, {
			...commonHeaders,
			"Content-Range": `bytes */${size}`,
		});
	}
	if (!range) {
		return c.body(asBody(createReadStream(file.path)), 200, {
			...commonHeaders,
			"Content-Length": size.toString(),
		});
	}

	const { start, end } = range;
	return c.body(asBody(createReadStream(file.path, { start, end })), 206, {
		...commonHeaders,
		"Content-Length": (end - start + 1).toString(),
		"Content-Range": `bytes ${start}-${end}/${size}`,
	});
}

export function parseByteRange(
	header: string | undefined,
	size: number,
): { start: number; end: number } | "invalid" | undefined {
	if (!header) return undefined;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match || (!match[1] && !match[2]) || size <= 0) return "invalid";

	if (!match[1]) {
		const suffixLength = Number(match[2]);
		if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0)
			return "invalid";
		return { start: Math.max(0, size - suffixLength), end: size - 1 };
	}

	const start = Number(match[1]);
	const requestedEnd = match[2] ? Number(match[2]) : size - 1;
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(requestedEnd) ||
		start < 0 ||
		start >= size ||
		requestedEnd < start
	) {
		return "invalid";
	}
	return { start, end: Math.min(requestedEnd, size - 1) };
}
