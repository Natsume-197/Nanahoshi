import path from "node:path";
import { getUserPermissionContext } from "@nanahoshi-v2/api/auth/access.repository";
import { hasGlobal } from "@nanahoshi-v2/api/auth/access.service";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import {
	isSupportedExtension,
	MAX_UPLOAD_BYTES,
} from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
import {
	enqueueUploadedFiles,
	type UploadedFile,
} from "@nanahoshi-v2/api/modules/uploads/upload.service";
import { bookRepository } from "@nanahoshi-v2/api/routers/books/book.repository";
import { libraryRepository } from "@nanahoshi-v2/api/routers/libraries/library.repository";
import { hashContentBytes } from "@nanahoshi-v2/api/utils/misc";
import { auth } from "@nanahoshi-v2/auth";
import type { Hono } from "hono";

const log = logger.child({ component: "upload-routes" });

/** Reject empty, traversal, or nested names; returns a safe basename or null. */
function safeBasename(rawName: string): string | null {
	const base = path.basename(rawName);
	if (!base || base === "." || base === "..") return null;
	if (base.includes("/") || base.includes("\\")) return null;
	return base;
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

		const formData = await c.req.formData();

		const libraryPathId = Number(formData.get("libraryPathId"));
		const targetPath = (library.paths ?? []).find(
			(p) => p.id === libraryPathId,
		);
		if (!targetPath || targetPath.isEnabled === false) {
			return c.json({ message: "Invalid or disabled library path" }, 400);
		}
		const root = path.resolve(targetPath.path);

		const files = formData
			.getAll("file")
			.filter((f): f is File => typeof f !== "string");
		if (files.length === 0) {
			return c.json({ message: "No files provided" }, 400);
		}

		const written: UploadedFile[] = [];
		const skipped: { filename: string; reason: string }[] = [];
		// Content hashes seen in this batch, so two identical files uploaded at once
		// don't both get written (the second would be a no-op duplicate).
		const seenHashes = new Set<string>();

		for (const file of files) {
			const safeName = safeBasename(file.name);
			if (!safeName) {
				skipped.push({ filename: file.name, reason: "invalid_name" });
				continue;
			}
			if (!isSupportedExtension(safeName, "ebook")) {
				skipped.push({ filename: safeName, reason: "unsupported_type" });
				continue;
			}
			if (file.size > MAX_UPLOAD_BYTES) {
				skipped.push({ filename: safeName, reason: "too_large" });
				continue;
			}

			// Hash from memory to dedupe by content before touching disk: the same
			// book already in the library (any path, any filename) would otherwise be
			// written and then silently dropped by the worker's ON CONFLICT, leaving
			// an orphan file and a misleading "success".
			const bytes = new Uint8Array(await file.arrayBuffer());
			const fileHash = await hashContentBytes(bytes);
			if (
				seenHashes.has(fileHash) ||
				(await bookRepository.existsByLibraryAndHash(libraryId, fileHash))
			) {
				skipped.push({ filename: safeName, reason: "duplicate" });
				continue;
			}

			const dest = path.join(root, safeName);
			// Defense in depth: the destination must stay under the root even though
			// safeBasename already strips path separators.
			if (!dest.startsWith(root + path.sep)) {
				skipped.push({ filename: safeName, reason: "invalid_path" });
				continue;
			}
			// Never overwrite an existing file.
			if (await Bun.file(dest).exists()) {
				skipped.push({ filename: safeName, reason: "already_exists" });
				continue;
			}

			try {
				await Bun.write(dest, bytes);
				seenHashes.add(fileHash);
				written.push({
					absolutePath: dest,
					filename: safeName,
					relativePath: safeName,
					size: file.size,
					mtimeMs: Date.now(),
					fileHash,
				});
			} catch (err) {
				const code = (err as NodeJS.ErrnoException)?.code;
				log.error({ err, dest, code }, "Failed to write uploaded file");
				skipped.push({
					filename: safeName,
					reason: code ? `write_failed (${code})` : "write_failed",
				});
			}
		}

		if (written.length === 0) {
			const message = skipped.every((s) => s.reason === "duplicate")
				? "These books are already in the library"
				: `No files were uploaded: ${skipped[0]?.reason ?? "unknown error"}`;
			return c.json({ message, skipped }, 400);
		}

		const { taskId } = await enqueueUploadedFiles({
			files: written,
			libraryId,
			libraryPathId,
			serverId,
			libraryName: library.name ?? "library",
			userId: session.user.id,
		});

		return c.json({
			uploaded: written.map((f) => f.filename),
			skipped,
			taskId,
		});
	});
}
