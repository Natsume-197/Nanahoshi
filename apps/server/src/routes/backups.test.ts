import { afterAll, expect, mock, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NotFoundError } from "@nanahoshi-v2/api/errors/index";
import { Hono } from "hono";

let session: { user: { role: string } } | null = null;
let resolutions = 0;
const root = await mkdtemp(join(tmpdir(), "nanahoshi-backup-route-"));
const path = join(root, "database.dump");
await writeFile(path, "private-database");
mock.module("@nanahoshi-v2/api/context", () => ({
	createContext: async () => ({ session }),
}));
mock.module("@nanahoshi-v2/api/modules/database-backup/backups", () => ({
	resolveBackup: async (filename: string) => {
		resolutions++;
		if (filename !== "database.dump")
			throw new NotFoundError("Backup not found");
		return { path, filename };
	},
}));
const { mountBackups } = await import("./backups");
const app = new Hono();
mountBackups(app);
afterAll(() => rm(root, { recursive: true, force: true }));

test("database downloads require an instance administrator", async () => {
	expect((await app.request("/backups/database.dump")).status).toBe(401);
	session = { user: { role: "user" } };
	expect((await app.request("/backups/database.dump")).status).toBe(403);
	expect(resolutions).toBe(0);
	session = { user: { role: "admin" } };
	const response = await app.request("/backups/database.dump");
	expect(response.status).toBe(200);
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	expect(response.headers.get("Content-Disposition")).toContain("attachment");
	expect(await response.text()).toBe("private-database");
	expect((await app.request("/backups/missing.dump")).status).toBe(404);
});
