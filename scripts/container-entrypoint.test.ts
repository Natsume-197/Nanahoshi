import { describe, expect, test } from "bun:test";
import path from "node:path";

const entrypoint = path.join(import.meta.dir, "..", "docker", "entrypoint");

describe("container entrypoint identity validation", () => {
	for (const [name, env] of [
		["non-numeric PUID", { PUID: "user", PGID: "1000" }],
		["root PUID", { PUID: "0", PGID: "1000" }],
		["non-numeric PGID", { PUID: "1000", PGID: "group" }],
		["root PGID", { PUID: "1000", PGID: "0" }],
	] as const) {
		test(`rejects ${name}`, () => {
			const result = Bun.spawnSync(["sh", entrypoint], {
				env: { ...process.env, ...env },
			});

			expect(result.exitCode).toBe(2);
			expect(result.stderr.toString()).toContain("positive numeric");
		});
	}
});
