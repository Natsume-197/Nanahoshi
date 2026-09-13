import { expect, test } from "bun:test";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("validates or detects Chrome before touching Docker", () => {
	const directory = mkdtempSync(path.join(tmpdir(), "nanahoshi-browser-test-"));
	const marker = path.join(directory, "docker-called");
	try {
		for (const [name, body] of [
			["google-chrome", "exit 0"],
			[
				"docker",
				'printf "%s" "$INSTALLATION_E2E_BROWSER" > "$BROWSER_TEST_MARKER"\nexit 99',
			],
		]) {
			const executable = path.join(directory, name);
			writeFileSync(executable, `#!/bin/sh\n${body}\n`);
			chmodSync(executable, 0o755);
		}
		const run = (browser: string) =>
			Bun.spawnSync(["bash", "scripts/ci-container-smoke.sh"], {
				env: {
					...process.env,
					PATH: `${directory}:${process.env.PATH}`,
					INSTALLATION_E2E_BROWSER: browser,
					CI_API_PORT: "3000",
					CONTAINER_SMOKE_DIAGNOSTICS_DIR: path.join(directory, "diagnostics"),
					BROWSER_TEST_MARKER: marker,
				},
			});
		const invalid = run("/path/to/chrome");
		expect(invalid.exitCode).toBe(2);
		expect(invalid.stderr.toString()).toContain(
			"Chrome/Chromium executable not found",
		);
		expect(() => readFileSync(marker)).toThrow();
		const detected = run("");
		expect(detected.exitCode, detected.stderr.toString()).toBe(99);
		expect(readFileSync(marker, "utf8")).toBe(
			path.join(directory, "google-chrome"),
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
