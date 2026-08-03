import { createReadStream, statSync } from "node:fs";
import {
	canAccessBookAction,
	resolveBookScopeCached,
	resolveLibraryAccess,
} from "@nanahoshi-v2/api/auth/access.repository";
import { hasGlobal } from "@nanahoshi-v2/api/auth/access.service";
import { createContext } from "@nanahoshi-v2/api/context";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import { getAudioFile } from "@nanahoshi-v2/api/routers/audiobooks/audiobook.service";
import {
	getDownloadPayload,
	getSeriesZipDownloadPayload,
} from "@nanahoshi-v2/api/routers/files/file.service";
import {
	createSeriesZipStream,
	zipFilename,
} from "@nanahoshi-v2/api/routers/files/helpers/seriesZip";
import {
	verifyAudioFileSignature,
	verifySeriesSignature,
	verifySignature,
} from "@nanahoshi-v2/api/routers/files/helpers/urlSigner";
import {
	parseBasicAuthKey,
	resolveOrgFromApiKey,
} from "@nanahoshi-v2/api/routers/opds/opds.auth";
import { auth } from "@nanahoshi-v2/auth";
import type { Hono } from "hono";
import { attachmentContentDisposition } from "../lib/content-disposition";
import { asBody } from "../lib/node-stream";

const log = logger.child({ component: "downloads-routes" });

export function mountDownloads(app: Hono) {
	app.get("/download/:uuid", async (c) => {
		const uuid = c.req.param("uuid");
		const exp = Number(c.req.query("exp"));
		const sig = c.req.query("sig");

		if (!sig || !exp) {
			return c.text("Unauthorized", 401);
		}
		if (!verifySignature(uuid, exp, sig)) {
			return c.text("Invalid or expired link", 403);
		}

		// Try Basic Auth first (OPDS clients), then fall back to cookie session.
		let serverId: string | undefined;
		let authSession: Parameters<typeof canAccessBookAction>[0] = null;
		const apiKey = parseBasicAuthKey(c.req.header("Authorization"));
		if (apiKey) {
			try {
				const user = await resolveOrgFromApiKey(auth, apiKey);
				if (user) {
					serverId = user.serverId;
					authSession = {
						user: { id: user.userId },
						session: { activeOrganizationId: user.serverId },
					};
				}
			} catch {
				// Invalid API key, continue
			}
		}

		if (!serverId) {
			const ctx = await createContext({ context: c });
			if (ctx.session?.user) {
				serverId = ctx.session.session.activeOrganizationId ?? undefined;
				authSession = ctx.session;
			}
		}

		if (!serverId) {
			return c.text("Unauthorized", 401);
		}

		const payload = await getDownloadPayload(uuid, serverId);
		if (!payload) {
			return c.text("Not found", 404);
		}

		// Audiobook downloads are gated by their own permission.
		const canDownload = await canAccessBookAction(
			authSession,
			uuid,
			payload.mediaType === "audiobook" ? "audiobook" : "book",
			"download",
		);
		if (!canDownload) {
			return c.text("Forbidden", 403);
		}

		if (payload.kind === "zip") {
			return c.body(createSeriesZipStream(payload.entries), 200, {
				"Content-Type": "application/zip",
				"Content-Disposition": attachmentContentDisposition(payload.zipName),
			});
		}

		try {
			const stats = statSync(payload.fullPath);
			const stream = createReadStream(payload.fullPath);

			return c.body(asBody(stream), 200, {
				"Content-Length": stats.size.toString(),
				"Content-Type": payload.mimetype,
				"Content-Disposition": attachmentContentDisposition(payload.filename),
			});
		} catch (error) {
			log.info({ err: error }, "File missing on disk");
			return c.text("File missing on disk", 404);
		}
	});

	app.get("/download/:uuid/file/:fileIndex", async (c) => {
		const uuid = c.req.param("uuid");
		const fileIndex = Number(c.req.param("fileIndex"));
		const exp = Number(c.req.query("exp"));
		const sig = c.req.query("sig");

		if (Number.isNaN(fileIndex) || fileIndex < 0) {
			return c.text("Invalid file index", 400);
		}
		if (!sig || !exp) {
			return c.text("Unauthorized", 401);
		}
		if (!verifyAudioFileSignature(uuid, fileIndex, exp, sig)) {
			return c.text("Invalid or expired link", 403);
		}

		const ctx = await createContext({ context: c });
		if (!ctx.session?.user) {
			return c.text("Unauthorized", 401);
		}
		const { serverId, scope } = await resolveBookScopeCached(ctx.session);
		if (!serverId) {
			return c.text("Forbidden", 403);
		}

		const canDownload = await canAccessBookAction(
			ctx.session,
			uuid,
			"audiobook",
			"download",
		);
		if (!canDownload) {
			return c.text("Forbidden", 403);
		}

		let file: Awaited<ReturnType<typeof getAudioFile>>;
		try {
			file = await getAudioFile(uuid, fileIndex, serverId, scope);
		} catch {
			return c.text("Not found", 404);
		}

		try {
			const stats = statSync(file.path);
			const stream = createReadStream(file.path);

			return c.body(asBody(stream), 200, {
				"Content-Length": stats.size.toString(),
				"Content-Type": file.mimeType || "application/octet-stream",
				"Content-Disposition": attachmentContentDisposition(file.filename),
			});
		} catch (error) {
			log.info({ err: error }, "Audio file missing on disk");
			return c.text("File missing on disk", 404);
		}
	});

	app.get("/download-series/:seriesUuid", async (c) => {
		const seriesUuid = c.req.param("seriesUuid");
		const exp = Number(c.req.query("exp"));
		const sig = c.req.query("sig");

		if (!sig || !exp) {
			return c.text("Unauthorized", 401);
		}
		if (!verifySeriesSignature(seriesUuid, exp, sig)) {
			return c.text("Invalid or expired link", 403);
		}

		const ctx = await createContext({ context: c });
		const access = await resolveLibraryAccess(ctx.session);
		if (!access) {
			return c.text("Unauthorized", 401);
		}
		if (!hasGlobal(access.pc, "book", "download")) {
			return c.text("Forbidden", 403);
		}

		const { entries, seriesName } = await getSeriesZipDownloadPayload(
			seriesUuid,
			access.serverId,
			access.accessibleLibraryIds,
		);
		if (entries.length === 0) {
			return c.text("Not found", 404);
		}

		return c.body(createSeriesZipStream(entries), 200, {
			"Content-Type": "application/zip",
			"Content-Disposition": attachmentContentDisposition(
				zipFilename(seriesName, "series"),
			),
		});
	});
}
