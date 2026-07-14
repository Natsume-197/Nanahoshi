import fs from "node:fs";
import path from "node:path";
import { getUserPermissionContext } from "@nanahoshi-v2/api/auth/access.repository";
import { hasGlobal } from "@nanahoshi-v2/api/auth/access.service";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import { auth } from "@nanahoshi-v2/auth";
import { env } from "@nanahoshi-v2/env/server";
import type { Context, Hono } from "hono";
import { serveStatic } from "hono/bun";
import sharp, { type Sharp } from "sharp";
import {
	avatarsDir,
	headersDir,
	serverBackgroundsDir,
	serverLogosDir,
} from "../lib/paths";

const log = logger.child({ component: "media-routes" });

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_HEADER_BYTES = 10 * 1024 * 1024;
const MAX_SERVER_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_SERVER_BACKGROUND_BYTES = 10 * 1024 * 1024;

const AVATAR_EXTENSIONS: Record<string, string> = {
	png: "png",
	jpeg: "jpg",
	webp: "webp",
	avif: "avif",
};

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
	app.use(
		"/api/data/server-logos/*",
		serveStatic({
			root: serverLogosDir,
			rewriteRequestPath: (p) => p.replace(/^\/api\/data\/server-logos/, ""),
		}),
	);
	app.use(
		"/api/data/server-backgrounds/*",
		serveStatic({
			root: serverBackgroundsDir,
			rewriteRequestPath: (p) =>
				p.replace(/^\/api\/data\/server-backgrounds/, ""),
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

		try {
			const buffer = Buffer.from(await file.arrayBuffer());
			const metadata = await sharp(buffer).metadata();
			const extension = metadata.format
				? AVATAR_EXTENSIONS[metadata.format]
				: undefined;
			if (!extension) {
				return c.json(
					{ message: "Avatar must be a PNG, JPEG, WebP, or AVIF image" },
					400,
				);
			}

			const filename = `${session.user.id}-${Date.now()}.${extension}`;
			const filePath = path.join(avatarsDir, filename);
			await fs.promises.writeFile(filePath, buffer);

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

	app.post("/api/server/logo", (c) =>
		handleServerImage(c, {
			dir: serverLogosDir,
			urlSegment: "server-logos",
			maxBytes: MAX_SERVER_LOGO_BYTES,
			maxLabel: "5MB",
			resize: (img) =>
				img.resize(512, 512, { fit: "cover", position: "attention" }),
		}),
	);

	app.post("/api/server/background", (c) =>
		handleServerImage(c, {
			dir: serverBackgroundsDir,
			urlSegment: "server-backgrounds",
			maxBytes: MAX_SERVER_BACKGROUND_BYTES,
			maxLabel: "10MB",
			resize: (img) =>
				img.resize(1920, 1080, { fit: "cover", position: "attention" }),
		}),
	);
}

/**
 * Shared handler for the two server-branding images (logo, invitation
 * background). Only members with `settings:update` on the active server may
 * replace them, so it resolves the caller's permission context before writing.
 */
async function handleServerImage(
	c: Context,
	opts: {
		dir: string;
		urlSegment: string;
		maxBytes: number;
		maxLabel: string;
		resize: (img: Sharp) => Sharp;
	},
) {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session?.user) {
		return c.json({ message: "Unauthorized" }, 401);
	}

	const serverId = session.session.activeOrganizationId;
	if (!serverId) {
		return c.json({ message: "No active organization" }, 400);
	}

	const pc = await getUserPermissionContext(session.user.id, serverId, {
		isAppOwner: session.user.role === "admin",
	});
	if (!hasGlobal(pc, "settings", "update")) {
		return c.json({ message: "Missing permission: settings:update" }, 403);
	}

	const formData = await c.req.formData();
	const file = formData.get("file");

	if (!file || typeof file === "string") {
		return c.json({ message: "Image file is required" }, 400);
	}
	if (!file.type.startsWith("image/")) {
		return c.json({ message: "Please choose a valid image file" }, 400);
	}
	if (file.size > opts.maxBytes) {
		return c.json(
			{ message: `Image must be ${opts.maxLabel} or smaller` },
			400,
		);
	}

	await fs.promises.mkdir(opts.dir, { recursive: true });

	const filename = `${serverId}-${Date.now()}.webp`;
	const filePath = path.join(opts.dir, filename);

	try {
		const buffer = Buffer.from(await file.arrayBuffer());
		await opts
			.resize(sharp(buffer).rotate())
			.webp({ quality: 90, effort: 5 })
			.toFile(filePath);

		return c.json({
			imageUrl: `${env.SERVER_URL}/api/data/${opts.urlSegment}/${filename}`,
		});
	} catch (error) {
		log.error({ err: error }, "Failed to process server image");
		return c.json({ message: "Failed to process image" }, 500);
	}
}
