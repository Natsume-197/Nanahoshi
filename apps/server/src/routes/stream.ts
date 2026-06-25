import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolveBookScope } from "@nanahoshi-v2/api/auth/access.repository";
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
		const { serverId, scope } = await resolveBookScope(ctx.session);

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
		const rangeHeader = c.req.header("Range");

		if (!rangeHeader) {
			const stream = createReadStream(file.path);
			return c.body(asBody(stream), 200, {
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
			"Content-Range": `bytes ${start}-${end}/${fileSize}`,
			"Accept-Ranges": "bytes",
			"Content-Length": chunkSize.toString(),
			"Content-Type": mimeType,
		});
	});
}
