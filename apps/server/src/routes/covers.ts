import fs from "node:fs";
import path from "node:path";
import {
	type CoverFormat,
	ensureCoverVariant,
	snapDim,
	snapQuality,
} from "@nanahoshi-v2/api/lib/cover-cache";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import type { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { coversDir, tmpDir } from "../lib/paths";

const log = logger.child({ component: "covers-routes" });

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
			const { cachePath } = await ensureCoverVariant({
				imagePath,
				width: w,
				height: h,
				quality,
				format,
				cacheDir: tmpDir,
			});
			const buffer = await fs.promises.readFile(cachePath);
			return c.body(
				new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
				200,
				{
					"Content-Type": format === "jpeg" ? "image/jpeg" : "image/avif",
					"Cache-Control": "public, max-age=31536000, immutable",
				},
			);
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
