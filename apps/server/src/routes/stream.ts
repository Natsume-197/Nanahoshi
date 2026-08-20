import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
	canAccessBookAction,
	resolveBookScopeCached,
} from "@nanahoshi-v2/api/auth/access.repository";
import { createContext } from "@nanahoshi-v2/api/context";
import { getAudioFile } from "@nanahoshi-v2/api/routers/audiobooks/audiobook.service";
import type { Hono } from "hono";
import { asBody } from "../lib/node-stream";

export function mountStream(app: Hono) {
	app.get("/stream/:uuid/:fileIndex", async (c) => {
		const uuid = c.req.param("uuid");
		const fileIndex = Number(c.req.param("fileIndex"));

		if (Number.isNaN(fileIndex) || fileIndex < 0) {
			return c.text("Invalid file index", 400);
		}

		const ctx = await createContext({ context: c });
		if (!ctx.session?.user) {
			return c.text("Unauthorized", 401);
		}
		const { serverId, scope } = await resolveBookScopeCached(ctx.session);
		// Fail closed: no active org means no tenant boundary can be enforced.
		// (Mirrors downloads.ts and canAccessBookAction.)
		if (!serverId) {
			return c.text("Forbidden", 403);
		}
		if (
			!(await canAccessBookAction(ctx.session, uuid, "audiobook", "download"))
		) {
			return c.text("Forbidden", 403);
		}

		let file: Awaited<ReturnType<typeof getAudioFile>>;
		try {
			file = await getAudioFile(uuid, fileIndex, serverId, scope);
		} catch {
			return c.text("Not found", 404);
		}

		let stats: Awaited<ReturnType<typeof stat>>;
		try {
			stats = await stat(file.path);
		} catch {
			return c.text("File missing on disk", 404);
		}

		const fileSize = stats.size;
		const mimeType = file.mimeType || "audio/mpeg";
		const etag = `"${fileSize}-${Math.floor(stats.mtimeMs)}"`;
		const lastModified = stats.mtime.toUTCString();
		const cacheHeaders = {
			"Cache-Control": "private, max-age=3600, no-transform",
			ETag: etag,
			"Last-Modified": lastModified,
		};

		if (c.req.header("If-None-Match") === etag) {
			return c.newResponse(null, 304, cacheHeaders);
		}

		// A stale If-Range validator means our copy changed since the client's
		// partial download: ignore the Range and resend the full file (RFC 9110).
		const ifRange = c.req.header("If-Range");
		const rangeHeader =
			ifRange && ifRange !== etag && ifRange !== lastModified
				? undefined
				: c.req.header("Range");

		if (!rangeHeader) {
			const stream = createReadStream(file.path);
			return c.body(asBody(stream), 200, {
				...cacheHeaders,
				"Content-Length": fileSize.toString(),
				"Content-Type": mimeType,
				"Accept-Ranges": "bytes",
			});
		}

		const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
		if (!match) {
			return c.text("Invalid Range", 416);
		}

		const start = Number(match[1]);
		const end = match[2] ? Number(match[2]) : fileSize - 1;

		if (start >= fileSize || end >= fileSize || start > end) {
			return c.newResponse(null, 416, {
				"Content-Range": `bytes */${fileSize}`,
			});
		}

		const chunkSize = end - start + 1;
		const stream = createReadStream(file.path, { start, end });

		return c.body(asBody(stream), 206, {
			...cacheHeaders,
			"Content-Range": `bytes ${start}-${end}/${fileSize}`,
			"Accept-Ranges": "bytes",
			"Content-Length": chunkSize.toString(),
			"Content-Type": mimeType,
		});
	});
}
