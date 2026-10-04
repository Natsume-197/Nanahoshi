import fs from "node:fs";
import path from "node:path";
import { getUserPermissionContext } from "@nanahoshi/api/auth/access.repository";
import { hasGlobal } from "@nanahoshi/api/auth/access.service";
import { logger } from "@nanahoshi/api/lib/logger";
import { auth } from "@nanahoshi/auth";
import { env } from "@nanahoshi/env/server";
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
const HEADER_MAX_WIDTH = 3000;
const HEADER_STANDARD_WIDTH = 1500;
const HEADER_ASPECT_RATIO = 4;
// AVIF scale — perceptually close to the webp 94 it replaced.
const HEADER_AVIF_QUALITY = 75;
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

function exceedsDeclaredSize(c: Context, maxBytes: number): boolean {
	const raw = c.req.header("content-length");
	if (!raw) return false;
	const size = Number(raw);
	return Number.isFinite(size) && size > maxBytes + MULTIPART_OVERHEAD_BYTES;
}

async function removeReplacedMedia(
	url: string | null | undefined,
	dir: string,
	requiredPrefix: string,
): Promise<void> {
	if (!url) return;
	let filename: string;
	try {
		const parsed = new URL(url);
		if (parsed.origin !== new URL(env.SERVER_URL).origin) return;
		filename = path.basename(parsed.pathname);
	} catch {
		return;
	}
	if (!filename.startsWith(requiredPrefix) || filename.includes("..")) return;
	const files = await fs.promises.readdir(dir).catch(() => []);
	// Headers have a full and a 1500w variant sharing userId + timestamp.
	const headerStem = filename.replace(/-\d+w\.avif$/, "-");
	await Promise.all(
		files
			.filter((candidate) =>
				dir === headersDir
					? candidate.startsWith(headerStem)
					: candidate === filename,
			)
			.map((candidate) =>
				fs.promises.unlink(path.join(dir, candidate)).catch(() => undefined),
			),
	);
}

const AVATAR_FORMATS = new Set(["png", "jpeg", "webp", "avif", "heif"]);
const ANIMATED_AVATAR_EXTENSIONS: Record<string, string> = {
	png: "png",
	webp: "webp",
};

type TabAvatarVariant = "jpeg" | "png";

/** `?format=jpeg` is the square 64px thumb; `?format=png&shape=circle` is a
 * round one with transparent corners, since an Android tab bar icon can't be
 * clipped on the device. */
export function tabAvatarVariant(
	format: string | undefined,
	shape: string | undefined,
): TabAvatarVariant | null {
	if (format === "jpeg") return "jpeg";
	if (format === "png" && shape === "circle") return "png";
	return null;
}

export async function renderTabAvatar(
	source: string | Buffer,
	variant: TabAvatarVariant,
): Promise<Buffer> {
	if (variant === "jpeg")
		return sharp(source)
			.resize(64, 64, { fit: "cover" })
			.jpeg({ quality: 82 })
			.toBuffer();
	const size = 96;
	const mask = Buffer.from(
		`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
	);
	return sharp(source)
		.resize(size, size, { fit: "cover" })
		.ensureAlpha()
		.composite([{ input: mask, blend: "dest-in" }])
		.png()
		.toBuffer();
}

export function mountMediaStatic(app: Hono) {
	// Native tab bars on Android cannot decode the AVIF files used for avatars.
	// Keep the normal static URL untouched and expose small variants for
	// native chrome that cannot attach the image decoder used by expo-image.
	app.get("/api/data/avatars/*", async (c, next) => {
		const variant = tabAvatarVariant(
			c.req.query("format"),
			c.req.query("shape"),
		);
		if (!variant) return next();
		const filename = path.basename(c.req.path);
		try {
			const image = await renderTabAvatar(
				path.join(avatarsDir, filename),
				variant,
			);
			return new Response(image, {
				headers: {
					"content-type": `image/${variant}`,
					"cache-control": "public, max-age=3600",
				},
			});
		} catch {
			return c.notFound();
		}
	});
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
	app.post("/api/media/cleanup", async (c) => {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });
		if (!session?.user) return c.json({ message: "Unauthorized" }, 401);
		const body = (await c.req.json().catch(() => null)) as {
			kind?: "avatar" | "header" | "logo" | "background";
			oldUrl?: string | null;
		} | null;
		if (!body?.kind || !body.oldUrl) return c.json({ ok: true });

		if (body.kind === "avatar" || body.kind === "header") {
			await removeReplacedMedia(
				body.oldUrl,
				body.kind === "avatar" ? avatarsDir : headersDir,
				`${session.user.id}-`,
			);
			return c.json({ ok: true });
		}

		const serverId = session.session.activeOrganizationId;
		if (!serverId) return c.json({ message: "No active organization" }, 400);
		const pc = await getUserPermissionContext(session.user.id, serverId, {
			isAppOwner: session.user.role === "admin",
		});
		if (!hasGlobal(pc, "settings", "update")) {
			return c.json({ message: "Missing permission: settings:update" }, 403);
		}
		await removeReplacedMedia(
			body.oldUrl,
			body.kind === "logo" ? serverLogosDir : serverBackgroundsDir,
			`${serverId}-`,
		);
		return c.json({ ok: true });
	});

	app.post("/api/profile/avatar", async (c) => {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });
		if (!session?.user) {
			return c.json({ message: "Unauthorized" }, 401);
		}
		if (exceedsDeclaredSize(c, MAX_AVATAR_BYTES)) {
			return c.json({ message: "Image must be 5MB or smaller" }, 413);
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
			if (!metadata.format || !AVATAR_FORMATS.has(metadata.format)) {
				return c.json(
					{ message: "Avatar must be a PNG, JPEG, WebP, or AVIF image" },
					400,
				);
			}

			// Animated avatars are stored as uploaded — sharp can't encode
			// animated AVIF, and re-encoding would drop the animation.
			const isAnimated = (metadata.pages ?? 1) > 1;
			const extension = isAnimated
				? ANIMATED_AVATAR_EXTENSIONS[metadata.format]
				: "avif";
			if (!extension) {
				return c.json({ message: "Animated avatars must be PNG or WebP" }, 400);
			}

			const filename = `${session.user.id}-${Date.now()}.${extension}`;
			const filePath = path.join(avatarsDir, filename);
			if (isAnimated) {
				await fs.promises.writeFile(filePath, buffer);
			} else {
				await sharp(buffer)
					.rotate()
					.avif({ quality: 70, effort: 4 })
					.toFile(filePath);
			}

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
		if (exceedsDeclaredSize(c, MAX_HEADER_BYTES)) {
			return c.json({ message: "Image must be 10MB or smaller" }, 413);
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

		try {
			// The client editor already delivers the exact framing the user chose,
			// so never re-crop here ("cover"/"attention" would shift it) — only
			// downscale preserving the incoming aspect ratio.
			const buffer = Buffer.from(await file.arrayBuffer());
			const fullImage = await sharp(buffer)
				.rotate()
				.resize(HEADER_MAX_WIDTH, HEADER_MAX_WIDTH / HEADER_ASPECT_RATIO, {
					fit: "inside",
					withoutEnlargement: true,
				})
				.avif({ quality: HEADER_AVIF_QUALITY, effort: 4 })
				.toBuffer({ resolveWithObject: true });

			const timestamp = Date.now();
			const filename = `${session.user.id}-${timestamp}-${fullImage.info.width}w.avif`;
			const variants = [
				fs.promises.writeFile(path.join(headersDir, filename), fullImage.data),
			];

			if (fullImage.info.width > HEADER_STANDARD_WIDTH) {
				// Width-only resize so the variant is always exactly 1500w — the
				// srcSet builder (getHeaderImageSources) derives its URL from that.
				const standardImage = await sharp(fullImage.data)
					.resize({ width: HEADER_STANDARD_WIDTH })
					.avif({ quality: HEADER_AVIF_QUALITY, effort: 4 })
					.toBuffer({ resolveWithObject: true });
				const standardFilename = `${session.user.id}-${timestamp}-${standardImage.info.width}w.avif`;
				variants.push(
					fs.promises.writeFile(
						path.join(headersDir, standardFilename),
						standardImage.data,
					),
				);
			}

			await Promise.all(variants);

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
	if (exceedsDeclaredSize(c, opts.maxBytes)) {
		return c.json(
			{ message: `Image must be ${opts.maxLabel} or smaller` },
			413,
		);
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

	const filename = `${serverId}-${Date.now()}.avif`;
	const filePath = path.join(opts.dir, filename);

	try {
		const buffer = Buffer.from(await file.arrayBuffer());
		await opts
			.resize(sharp(buffer).rotate())
			.avif({ quality: 65, effort: 4 })
			.toFile(filePath);

		return c.json({
			imageUrl: `${env.SERVER_URL}/api/data/${opts.urlSegment}/${filename}`,
		});
	} catch (error) {
		log.error({ err: error }, "Failed to process server image");
		return c.json({ message: "Failed to process image" }, 500);
	}
}
