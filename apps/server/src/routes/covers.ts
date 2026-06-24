import fs from "node:fs";
import path from "node:path";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import type { Hono } from "hono";
import { serveStatic } from "hono/bun";
import sharp from "sharp";
import { coversDir, tmpDir } from "../lib/paths";

const log = logger.child({ component: "covers-routes" });

const MAX_COVER_DIM = 2048;

export function mountCovers(app: Hono) {
	app.get("/api/data/covers/:filename", async (c, next) => {
		const { filename } = c.req.param();
		const width = Number(c.req.query("width"));
		const height = Number(c.req.query("height"));
		const format = c.req.query("format") === "jpeg" ? "jpeg" : "webp";
		const rawQuality = Number(c.req.query("quality"));
		const quality = Number.isFinite(rawQuality)
			? Math.min(100, Math.max(1, Math.round(rawQuality)))
			: 90;
		const clampDim = (n: number) =>
			Number.isFinite(n) && n > 0 ? Math.min(MAX_COVER_DIM, Math.round(n)) : 0;
		const w = clampDim(width);
		const h = clampDim(height);

		if (!w && !h && format === "webp") return next();

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

		const cacheFile = `${path.basename(filename, ".webp")}-${w || 0}_${h || 0}_q${quality}_v2.${format}`;
		const cachePath = path.join(tmpDir, cacheFile);
		const contentType = format === "jpeg" ? "image/jpeg" : "image/webp";

		await fs.promises.mkdir(tmpDir, { recursive: true });

		try {
			if (!fs.existsSync(cachePath)) {
				let pipeline = sharp(imagePath);
				if (w || h) {
					pipeline = pipeline.resize(w || undefined, h || undefined, {
						kernel: sharp.kernel.lanczos3,
						fit: "inside",
						withoutEnlargement: true,
					});
				}
				if (format === "jpeg") {
					pipeline = pipeline.jpeg({ quality });
				} else {
					pipeline = pipeline.webp({
						quality,
						effort: 5,
						smartSubsample: true,
					});
				}
				await pipeline.toFile(cachePath);
			}
			const buffer = await fs.promises.readFile(cachePath);
			return c.body(new Uint8Array(buffer), 200, {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=31536000, immutable",
			});
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
