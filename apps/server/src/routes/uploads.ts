import fs from "node:fs";
import path from "node:path";
import { getUserPermissionContext } from "@nanahoshi/api/auth/access.repository";
import { hasGlobal } from "@nanahoshi/api/auth/access.service";
import { logger } from "@nanahoshi/api/lib/logger";
import {
	isSupportedExtension,
	MAX_UPLOAD_BYTES,
} from "@nanahoshi/api/modules/scanning/supportedExtensions";
import {
	enqueueUploadedFiles,
	type UploadedFile,
} from "@nanahoshi/api/modules/uploads/upload.service";
import { bookRepository } from "@nanahoshi/api/routers/books/book.repository";
import { libraryRepository } from "@nanahoshi/api/routers/libraries/library.repository";
import { calculateContentHash } from "@nanahoshi/api/utils/misc";
import { auth } from "@nanahoshi/auth";
import type { Context, Hono } from "hono";
import { receiveUploadToFile, UploadTooLargeError } from "./upload-receive";

const log = logger.child({ component: "upload-routes" });

/** Reject empty, traversal, or nested names; returns a safe basename or null. */
function safeBasename(rawName: string): string | null {
	const base = path.basename(rawName);
	if (!base || base === "." || base === "..") return null;
	if (base.includes("/") || base.includes("\\")) return null;
	return base;
}

function skipped(
	c: Context,
	filename: string,
	reason: string,
	status: 400 | 413 = 400,
) {
	return c.json(
		{
			message: `No files were uploaded: ${reason}`,
			skipped: [{ filename, reason }],
		},
		status,
	);
}

export function mountUploads(app: Hono) {
	app.post("/api/libraries/:libraryUuid/upload", async (c) => {
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
		if (!hasGlobal(pc, "library", "upload")) {
			return c.json({ message: "Missing permission: library:upload" }, 403);
		}

		const libraryUuid = c.req.param("libraryUuid");
		const library = await libraryRepository.findByUuid(libraryUuid, serverId);
		if (!library) {
			return c.json({ message: "Library not found" }, 404);
		}
		const libraryId = library.id;
		if (library.mediaType === "audiobook") {
			return c.json(
				{ message: "Uploads are only supported for ebook libraries" },
				400,
			);
		}

		// One file per request, sent as the raw body: it streams straight to disk
		// so a multi-gigabyte book never has to fit in memory.
		const libraryPathId = Number(c.req.query("libraryPathId"));
		const targetPath = (library.paths ?? []).find(
			(p) => p.id === libraryPathId,
		);
		if (!targetPath || targetPath.isEnabled === false) {
			return c.json({ message: "Invalid or disabled library path" }, 400);
		}
		const root = path.resolve(targetPath.path);

		const rawName = c.req.query("filename") ?? "";
		const safeName = safeBasename(rawName);
		if (!safeName) return skipped(c, rawName, "invalid_name");
		if (!isSupportedExtension(safeName, "ebook")) {
			return skipped(c, safeName, "unsupported_type");
		}
		const declaredSize = Number(c.req.header("content-length"));
		if (Number.isFinite(declaredSize) && declaredSize > MAX_UPLOAD_BYTES) {
			return skipped(c, safeName, "too_large", 413);
		}
		const body = c.req.raw.body;
		if (!body) {
			return c.json({ message: "No files provided" }, 400);
		}

		const dest = path.join(root, safeName);
		// Defense in depth: the destination must stay under the root even though
		// safeBasename already strips path separators.
		if (!dest.startsWith(root + path.sep)) {
			return skipped(c, safeName, "invalid_path");
		}
		// Never overwrite an existing file.
		if (await Bun.file(dest).exists()) {
			return skipped(c, safeName, "already_exists");
		}

		// Dotfile with an unsupported extension, so scans ignore it mid-transfer;
		// same directory, so the final rename is atomic.
		const tmp = path.join(root, `.${crypto.randomUUID()}.nanahoshi-upload`);
		let size: number;
		try {
			size = await receiveUploadToFile(body, tmp, MAX_UPLOAD_BYTES);
		} catch (err) {
			if (err instanceof UploadTooLargeError) {
				return skipped(c, safeName, "too_large", 413);
			}
			const code = (err as NodeJS.ErrnoException)?.code;
			log.warn({ err, dest, code }, "Upload stream did not complete");
			return skipped(
				c,
				safeName,
				code ? `write_failed (${code})` : "write_failed",
			);
		}

		let written: UploadedFile;
		try {
			// The worker would silently drop a book already in the library (any
			// path, any filename) via ON CONFLICT, leaving an orphan file and a
			// misleading "success".
			const fileHash = await calculateContentHash(tmp, size);
			if (!fileHash) throw new Error("Could not hash uploaded file");
			if (await bookRepository.existsByLibraryAndHash(libraryId, fileHash)) {
				await fs.promises.rm(tmp, { force: true });
				return skipped(c, safeName, "duplicate");
			}
			if (await Bun.file(dest).exists()) {
				await fs.promises.rm(tmp, { force: true });
				return skipped(c, safeName, "already_exists");
			}
			await fs.promises.rename(tmp, dest);
			written = {
				absolutePath: dest,
				filename: safeName,
				relativePath: safeName,
				size,
				mtimeMs: Date.now(),
				fileHash,
			};
		} catch (err) {
			await fs.promises.rm(tmp, { force: true });
			const code = (err as NodeJS.ErrnoException)?.code;
			log.error({ err, dest, code }, "Failed to store uploaded file");
			return skipped(
				c,
				safeName,
				code ? `write_failed (${code})` : "write_failed",
			);
		}

		let taskId: string;
		try {
			({ taskId } = await enqueueUploadedFiles({
				files: [written],
				libraryId,
				libraryPathId,
				serverId,
				libraryName: library.name ?? "library",
				userId: session.user.id,
			}));
		} catch (err) {
			await fs.promises.unlink(dest).catch(() => undefined);
			log.error(
				{ err, libraryId },
				"Failed to enqueue uploaded file; rolled back write",
			);
			return c.json(
				{ message: "Upload processing is temporarily unavailable" },
				503,
			);
		}

		return c.json({ uploaded: [safeName], skipped: [], taskId });
	});
}
