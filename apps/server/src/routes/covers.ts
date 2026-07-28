import fs from "node:fs";
import path from "node:path";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import type { Hono } from "hono";
import { serveStatic } from "hono/bun";
import sharp from "sharp";
import { coversDir, tmpDir } from "../lib/paths";

const log = logger.child({ component: "covers-routes" });

// Requested sizes/qualities are snapped to a small fixed set of buckets so the
// unauthenticated resize cache can only ever hold a bounded number of files per
// cover (otherwise an attacker could fill the disk with distinct dimensions).
const ALLOWED_DIMS = [64, 128, 200, 300, 400, 600, 800, 1200, 2048] as const;
const MAX_COVER_DIM = 2048;
// AVIF-scale buckets: quality numbers don't compare across codecs (avif 60 ≈
// webp 90). The jpeg fallback (OPDS clients without AVIF decode) maps each
// bucket to its perceptually equivalent jpeg quality.
const ALLOWED_QUALITIES = [50, 60, 75, 86, 95] as const;
const JPEG_QUALITY: Record<number, number> = {
	50: 78,
	60: 85,
	75: 92,
	86: 95,
	95: 97,
};
const MAX_QUALITY = Math.max(...ALLOWED_QUALITIES);

function snapDim(n: number): number {
	if (!Number.isFinite(n) || n <= 0) return 0;
	return ALLOWED_DIMS.find((d) => d >= n) ?? MAX_COVER_DIM;
}

function snapQuality(n: number): number {
	if (!Number.isFinite(n)) return 60;
	// Above the top bucket, clamp up. Falling back to the default here would
	// answer a request for *more* quality with markedly less.
	return ALLOWED_QUALITIES.find((q) => q >= n) ?? MAX_QUALITY;
}

export function mountCovers(app: Hono) {
	app.get("/api/data/covers/:filename", async (c, next) => {
		const { filename } = c.req.param();
		const width = Number(c.req.query("width"));
		const height = Number(c.req.query("height"));
		const format = c.req.query("format") === "jpeg" ? "jpeg" : "avif";
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

		const cacheFile = `${path.basename(filename, path.extname(filename))}-${w || 0}_${h || 0}_q${quality}_v3.${format}`;
		const cachePath = path.join(tmpDir, cacheFile);
		const contentType = format === "jpeg" ? "image/jpeg" : "image/avif";

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
					pipeline = pipeline.jpeg({ quality: JPEG_QUALITY[quality] ?? 85 });
				} else {
					// effort 1: matches the old webp encode speed on low-power hosts at
					// ~equal PSNR/size to effort 3 for these widths (effort 0 degrades).
					pipeline = pipeline.avif({ quality, effort: 1 });
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
