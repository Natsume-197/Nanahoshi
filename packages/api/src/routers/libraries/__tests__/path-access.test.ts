import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathAccess } from "../path-access";

// Real filesystem on purpose: the whole point of the probe is to tell apart the
// ways a library folder can stop working, and a mocked fs proves nothing.
let root: string;

beforeAll(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "nanahoshi-probe-"));
	await fs.mkdir(path.join(root, "library"));
	await fs.writeFile(path.join(root, "a-file.epub"), "not a folder");
});

afterAll(async () => {
	await fs.chmod(path.join(root, "library"), 0o755).catch(() => {});
	await fs.rm(root, { recursive: true, force: true });
});

describe("pathAccess.probe", () => {
	test("reports a readable folder as ok", async () => {
		expect(await pathAccess.probe(path.join(root, "library"))).toEqual({
			state: "ok",
		});
	});

	test("reports a folder that is gone as missing", async () => {
		const probe = await pathAccess.probe(path.join(root, "unmounted"));
		expect(probe.state).toBe("missing");
		expect(probe).toHaveProperty("reason");
	});

	test("reports a file pointed at by mistake", async () => {
		const probe = await pathAccess.probe(path.join(root, "a-file.epub"));
		expect(probe.state).toBe("not_a_directory");
	});

	// Root ignores the permission bits, so this can only be asserted as a
	// non-root user; the branch is still exercised by the missing/ok cases.
	test.skipIf(process.getuid?.() === 0)(
		"reports a folder whose permissions were revoked as unreadable",
		async () => {
			const locked = path.join(root, "library");
			await fs.chmod(locked, 0o000);
			try {
				const probe = await pathAccess.probe(locked);
				expect(probe.state).toBe("unreadable");
			} finally {
				await fs.chmod(locked, 0o755);
			}
		},
	);

	test("normalizes the path before probing", async () => {
		const messy = path.join(root, "library", "..", "library");
		expect(await pathAccess.probe(messy)).toEqual({ state: "ok" });
	});
});
