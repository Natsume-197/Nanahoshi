import { createReadStream } from "node:fs";
import { createContext } from "@nanahoshi-v2/api/context";
import { NotFoundError } from "@nanahoshi-v2/api/errors/index";
import { resolveBackup } from "@nanahoshi-v2/api/modules/database-backup/backups";
import type { Hono } from "hono";
import { attachmentContentDisposition } from "../lib/content-disposition";
import { asBody } from "../lib/node-stream";

export function mountBackups(app: Hono) {
	app.get("/backups/:filename", async (c) => {
		const { session } = await createContext({ context: c });
		if (!session) return c.text("Unauthorized", 401);
		if (session.user.role !== "admin") return c.text("Forbidden", 403);
		try {
			const file = await resolveBackup(c.req.param("filename"));
			return c.body(asBody(createReadStream(file.path)), 200, {
				"Content-Type": "application/octet-stream",
				"Content-Disposition": attachmentContentDisposition(file.filename),
				"Cache-Control": "no-store",
			});
		} catch (error) {
			if (error instanceof NotFoundError) return c.text("Not found", 404);
			throw error;
		}
	});
}
