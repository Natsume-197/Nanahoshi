import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installBlockFor } from "../install-block";
import { isFloatingReference } from "../protocol";
import { readUpdaterConnection, writeUpdaterRequest } from "../updater-link";

describe("isFloatingReference", () => {
	test("only an untagged or latest reference follows releases", () => {
		expect(isFloatingReference("ghcr.io/natsume-197/nanahoshi:latest")).toBe(
			true,
		);
		expect(isFloatingReference("ghcr.io/natsume-197/nanahoshi")).toBe(true);
		expect(isFloatingReference("localhost:5000/nanahoshi")).toBe(true);
		expect(isFloatingReference("ghcr.io/natsume-197/nanahoshi:v1.2.0")).toBe(
			false,
		);
		expect(
			isFloatingReference("ghcr.io/natsume-197/nanahoshi@sha256:abc"),
		).toBe(false);
	});
});

describe("updater link", () => {
	const status = (heartbeatAt: string, protocol = 1) => ({
		protocol,
		updaterVersion: "v1.0.0",
		heartbeatAt,
		problem: null,
		target: null,
		staged: null,
		phase: "idle",
		progress: null,
		lastOperation: null,
	});

	test("reads connected, stale, incompatible and absent updaters", async () => {
		const directory = await mkdtemp(join(tmpdir(), "nanahoshi-link-"));
		try {
			const now = Date.parse("2026-11-24T12:00:00Z");
			expect((await readUpdaterConnection(directory, now)).state).toBe(
				"absent",
			);
			await writeFile(
				join(directory, "status.json"),
				JSON.stringify(status("2026-11-24T11:59:30Z")),
			);
			expect((await readUpdaterConnection(directory, now)).state).toBe(
				"connected",
			);
			await writeFile(
				join(directory, "status.json"),
				JSON.stringify(status("2026-11-24T11:50:00Z")),
			);
			expect((await readUpdaterConnection(directory, now)).state).toBe("stale");
			await writeFile(
				join(directory, "status.json"),
				JSON.stringify(status("2026-11-24T11:59:30Z", 2)),
			);
			expect((await readUpdaterConnection(directory, now)).state).toBe(
				"incompatible",
			);
			await writeFile(join(directory, "status.json"), "{not json");
			expect((await readUpdaterConnection(directory, now)).state).toBe(
				"absent",
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("a request is one empty file named after it", async () => {
		const directory = await mkdtemp(join(tmpdir(), "nanahoshi-link-"));
		try {
			await writeUpdaterRequest(directory, "install");
			expect(await readdir(join(directory, "requests"))).toEqual(["install"]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});

describe("installBlockFor", () => {
	const updater = {
		state: "connected" as const,
		problem: null,
		image: "ghcr.io/natsume-197/nanahoshi:latest",
		pinned: false,
		phase: "idle" as const,
		progress: null,
		stagedVersion: null,
		lastOperation: null,
	};
	const base = {
		release: "v1.0.0",
		checkEnabled: true,
		updater,
		available: true,
	};

	test("allows an install with a connected updater and a newer release", () => {
		expect(installBlockFor(base)).toBeNull();
	});

	test("names the first obstacle", () => {
		expect(installBlockFor({ ...base, release: "development" })).toBe(
			"development",
		);
		expect(
			installBlockFor({ ...base, updater: { ...updater, state: "absent" } }),
		).toBe("updater-absent");
		expect(
			installBlockFor({ ...base, updater: { ...updater, pinned: true } }),
		).toBe("pinned");
		expect(
			installBlockFor({ ...base, updater: { ...updater, phase: "pulling" } }),
		).toBe("busy");
		expect(installBlockFor({ ...base, available: false })).toBe("no-update");
	});

	test("a staged newer image counts as an update, and so does any pull without the check", () => {
		expect(
			installBlockFor({
				...base,
				available: false,
				updater: { ...updater, stagedVersion: "v1.1.0" },
			}),
		).toBeNull();
		expect(
			installBlockFor({ ...base, available: false, checkEnabled: false }),
		).toBeNull();
	});
});
