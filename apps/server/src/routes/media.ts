import fs from "node:fs";
import path from "node:path";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import { auth } from "@nanahoshi-v2/auth";
import { env } from "@nanahoshi-v2/env/server";
import type { Hono } from "hono";
import { serveStatic } from "hono/bun";
import sharp from "sharp";
import { avatarsDir, headersDir } from "../lib/paths";

const log = logger.child({ component: "media-routes" });

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_HEADER_BYTES = 10 * 1024 * 1024;

export function mountMediaStatic(app: Hono) {
	app.use(
		"/api/data/avatars/*",
		serveStatic({
			root: avatarsDir,
			rewriteRequestPath: (p) => p.replace(/^\/api\/data\/avatars/, ""),
		}),
	);
	app.use(
		"/api/data/headers/*",
		serveStatic({
			root: headersDir,
			rewriteRequestPath: (p) => p.replace(/^\/api\/data\/headers/, ""),
		}),
	);
}

export function mountMediaUploads(app: Hono) {
	app.post("/api/profile/avatar", async (c) => {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });
		if (!session?.user) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		const formData = await c.req.formData();
		const file = formData.get("file");

		if (!file || typeof file === "string") {
			return c.json({ message: "Image file is required" }, 400);
		}
		if (!file.type.startsWith("image/")) {
			return c.json({ message: "Please choose a valid image file" }, 400);
		}
		if (file.size > MAX_AVATAR_BYTES) {
			return c.json({ message: "Image must be 5MB or smaller" }, 400);
		}

		await fs.promises.mkdir(avatarsDir, { recursive: true });

		const filename = `${session.user.id}-${Date.now()}.webp`;
		const filePath = path.join(avatarsDir, filename);

		try {
			const buffer = Buffer.from(await file.arrayBuffer());
			await sharp(buffer)
				.rotate()
				.resize(512, 512, { fit: "cover", position: "attention" })
				.webp({ quality: 90, effort: 5 })
				.toFile(filePath);

			return c.json({
				imageUrl: `${env.SERVER_URL}/api/data/avatars/${filename}`,
			});
		} catch (error) {
			log.error({ err: error }, "Failed to process avatar image");
			return c.json({ message: "Failed to process image" }, 500);
		}
	});

	app.post("/api/profile/header", async (c) => {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });
		if (!session?.user) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		const formData = await c.req.formData();
		const file = formData.get("file");

		if (!file || typeof file === "string") {
			return c.json({ message: "Image file is required" }, 400);
		}
		if (!file.type.startsWith("image/")) {
			return c.json({ message: "Please choose a valid image file" }, 400);
		}
		if (file.size > MAX_HEADER_BYTES) {
			return c.json({ message: "Image must be 10MB or smaller" }, 400);
		}

		await fs.promises.mkdir(headersDir, { recursive: true });

		const filename = `${session.user.id}-${Date.now()}.webp`;
		const filePath = path.join(headersDir, filename);

		try {
			const buffer = Buffer.from(await file.arrayBuffer());
			await sharp(buffer)
				.rotate()
				.resize(1500, 500, { fit: "cover", position: "attention" })
				.webp({ quality: 90, effort: 5 })
				.toFile(filePath);

			return c.json({
				imageUrl: `${env.SERVER_URL}/api/data/headers/${filename}`,
			});
		} catch (error) {
			log.error({ err: error }, "Failed to process header image");
			return c.json({ message: "Failed to process image" }, 500);
		}
	});
}
