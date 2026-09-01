import fs from "node:fs/promises";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import { getSeriesSharePreview } from "@nanahoshi-v2/api/routers/series/series.service";
import type { Hono } from "hono";
import { ensureSeriesShareImage } from "../lib/series-share-image";

const log = logger.child({ component: "series-share-images" });
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mountSeriesShareImages(app: Hono) {
	app.get("/api/share/series/:mediaType/:filename", async (c) => {
		const mediaType = c.req.param("mediaType");
		const filename = c.req.param("filename");
		if (
			(mediaType !== "ebook" && mediaType !== "audiobook") ||
			!filename.endsWith(".jpg")
		) {
			return c.notFound();
		}

		const uuid = filename.slice(0, -4);
		if (!UUID_PATTERN.test(uuid)) return c.notFound();

		try {
			const preview = await getSeriesSharePreview({ uuid, mediaType });
			const coverFilenames = [
				...new Set(
					(preview?.covers ?? [])
						.map((cover) => cover.split("/").pop())
						.filter((cover): cover is string => Boolean(cover)),
				),
			].slice(0, 3);
			if (coverFilenames.length < 2) return c.notFound();

			const imagePath = await ensureSeriesShareImage({
				uuid,
				mediaType,
				coverFilenames,
			});
			if (!imagePath) return c.notFound();
			const image = await fs.readFile(imagePath);
			return c.body(
				new Uint8Array(image.buffer, image.byteOffset, image.byteLength),
				200,
				{
					"Content-Type": "image/jpeg",
					"Cache-Control": "public, max-age=31536000, immutable",
				},
			);
		} catch (err) {
			log.error({ err, uuid, mediaType }, "Error creating series share image");
			return c.text("Error creating preview image", 500);
		}
	});
}
