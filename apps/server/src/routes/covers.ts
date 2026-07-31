import fs from "node:fs";
import path from "node:path";
import { coverIngestQueue } from "@nanahoshi-v2/api/infrastructure/queue/queues/cover-ingest.queue";
import {
	type CoverFormat,
	coverCacheFile,
	ensureCoverVariant,
	findWarmFallback,
	snapDim,
	snapQuality,
} from "@nanahoshi-v2/api/lib/cover-cache";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import type { Context, Hono } from "hono";
import { serveStatic } from "hono/bun";
import { coversDir, tmpDir } from "../lib/paths";

const log = logger.child({ component: "covers-routes" });

/** Encoding a cold 1200px AVIF costs ~2.25s, and this runs in the API process.
 * Past this width a miss is answered from a narrower rendition instead. */
const INLINE_ENCODE_MAX_WIDTH = 600;

export function mountCovers(app: Hono) {
	app.get("/api/data/covers/:filename", async (c, next) => {
		const { filename } = c.req.param();
		const width = Number(c.req.query("width"));
		const height = Number(c.req.query("height"));
		const format: CoverFormat =
			c.req.query("format") === "jpeg" ? "jpeg" : "avif";
		const quality = snapQuality(Number(c.req.query("quality")));
		const w = snapDim(width);
		const h = snapDim(height);

		if (!w && !h && !c.req.query("format")) return next();

		if (
			filename.includes("/") ||
			filename.includes("\\") ||
			filename.includes("\0")
		) {
			return c.text("Invalid filename", 400);
		}
		const imagePath = path.join(coversDir, filename);
		const resolved = path.resolve(imagePath);
		if (
			resolved !== imagePath ||
			!resolved.startsWith(path.resolve(coversDir) + path.sep)
		) {
			return c.text("Invalid filename", 400);
		}

		try {
			const cachePath = path.join(
				tmpDir,
				coverCacheFile(imagePath, w, h, quality, format),
			);
			if (!fs.existsSync(cachePath) && w > INLINE_ENCODE_MAX_WIDTH) {
				const provisional = await serveProvisional(
					c,
					imagePath,
					w,
					h,
					quality,
					format,
				);
				if (provisional) return provisional;
			}

			await ensureCoverVariant({
				imagePath,
				width: w,
				height: h,
				quality,
				format,
				cacheDir: tmpDir,
			});
			return respond(c, cachePath, format, true);
		} catch (err) {
			log.error({ err }, "Error processing image");
			return c.text("Error processing image", 500);
		}
	});

	app.use("/api/data/covers/*", async (c, next) => {
		await next();
		if (c.res.ok) {
			c.res.headers.set("Cache-Control", "public, max-age=86400");
		}
	});
	app.use(
		"/api/data/covers/*",
		serveStatic({
			root: coversDir,
			rewriteRequestPath: (p) => p.replace(/^\/api\/data\/covers/, ""),
		}),
	);
}

/**
 * Answers a wide miss from a narrower rendition that is already on disk, and
 * hands the real encode to the worker process. The response is uncached, so the
 * browser comes back for the exact width once the worker has written it —
 * softness for a moment beats a multi-second stall on a cover that is visible.
 */
async function serveProvisional(
	c: Context,
	imagePath: string,
	width: number,
	height: number,
	quality: number,
	format: CoverFormat,
) {
	const fallback = await findWarmFallback(
		imagePath,
		width,
		quality,
		format,
		tmpDir,
	);
	if (!fallback) return null;

	// One job per exact variant, however many viewers race for it.
	const jobId = `rendition:${coverCacheFile(imagePath, width, height, quality, format)}`;
	await coverIngestQueue
		.add("rendition", { imagePath, width, quality, format }, { jobId })
		.catch((err) => log.warn({ err }, "Rendition enqueue failed"));

	return respond(c, fallback, format, false);
}

async function respond(
	c: Context,
	filePath: string,
	format: CoverFormat,
	exact: boolean,
) {
	const buffer = await fs.promises.readFile(filePath);
	return c.body(
		new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
		200,
		{
			"Content-Type": format === "jpeg" ? "image/jpeg" : "image/avif",
			"Cache-Control": exact
				? "public, max-age=31536000, immutable"
				: "no-store",
		},
	);
}
