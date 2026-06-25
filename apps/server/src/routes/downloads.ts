import { createReadStream, statSync } from "node:fs";
import { createContext } from "@nanahoshi-v2/api/context";
import { logger } from "@nanahoshi-v2/api/lib/logger";
import {
	getFileInfo,
	getSeriesZipEntries,
} from "@nanahoshi-v2/api/routers/files/file.service";
import {
	createSeriesZipStream,
	seriesZipFilename,
} from "@nanahoshi-v2/api/routers/files/helpers/seriesZip";
import {
	verifySeriesSignature,
	verifySignature,
} from "@nanahoshi-v2/api/routers/files/helpers/urlSigner";
import {
	parseBasicAuthKey,
	resolveOrgFromApiKey,
} from "@nanahoshi-v2/api/routers/opds/opds.auth";
import { auth } from "@nanahoshi-v2/auth";
import type { Hono } from "hono";
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

		// Try Basic Auth first (OPDS clients), then fall back to cookie session
		let serverId: string | undefined;
		const apiKey = parseBasicAuthKey(c.req.header("Authorization"));
		if (apiKey) {
			try {
				const user = await resolveOrgFromApiKey(auth, apiKey);
				serverId = user?.serverId;
			} catch {
				// Invalid API key, continue
			}
		}

		if (!serverId) {
			const ctx = await createContext({ context: c });
			if (ctx.session?.user) {
				serverId = ctx.session.session.activeOrganizationId ?? undefined;
			}
		}

		if (!serverId) {
			return c.text("Unauthorized", 401);
		}

		const file = await getFileInfo(uuid, serverId);
		if (!file) {
			return c.text("Not found", 404);
		}

		try {
			const stats = statSync(file.fullPath);
			const stream = createReadStream(file.fullPath);

			return c.body(asBody(stream), 200, {
				"Content-Length": stats.size.toString(),
				"Content-Type": file.mimetype,
				"Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
			});
		} catch (error) {
			log.info({ err: error }, "File missing on disk");
			return c.text("File missing on disk", 404);
		}
	});

	app.get("/download-series/:seriesName", async (c) => {
		const seriesName = c.req.param("seriesName");
		const exp = Number(c.req.query("exp"));
		const sig = c.req.query("sig");

		if (!sig || !exp) {
			return c.text("Unauthorized", 401);
		}
		if (!verifySeriesSignature(seriesName, exp, sig)) {
			return c.text("Invalid or expired link", 403);
		}

		const ctx = await createContext({ context: c });
		const serverId = ctx.session?.user
			? (ctx.session.session.activeOrganizationId ?? undefined)
			: undefined;
		if (!serverId) {
			return c.text("Unauthorized", 401);
		}

		const entries = await getSeriesZipEntries(seriesName, serverId);
		if (entries.length === 0) {
			return c.text("Not found", 404);
		}

		return c.body(createSeriesZipStream(entries), 200, {
			"Content-Type": "application/zip",
			"Content-Disposition": `attachment; filename="${encodeURIComponent(seriesZipFilename(seriesName))}"`,
		});
	});
}
