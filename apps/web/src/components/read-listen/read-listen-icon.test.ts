import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (relativePath: string) =>
	readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("Read & Listen icon", () => {
	test("uses the shared Waveform icon on every feature entry point", () => {
		expect(source("./read-listen-icon.ts")).toContain(
			"Waveform as ReadListenIcon",
		);

		for (const path of [
			"../dashboard/dashboard-app-rail.tsx",
			"../dashboard/mobile-bottom-nav.tsx",
			"../audio-player/read-listen-player.tsx",
			"../audio-player/player-more-menu.tsx",
			"../../features/reader/ui/chrome/reader-header.tsx",
		]) {
			const entryPoint = source(path);
			expect(entryPoint).toContain("ReadListenIcon");
		}
	});
});
