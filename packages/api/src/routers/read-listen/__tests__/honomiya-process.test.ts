import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
	createHonomiyaAlignCommand,
	resolveHonomiyaCliPath,
} from "../honomiya-process";

describe("Honomiya process boundary", () => {
	test("discovers an independent sibling repository from a nested server cwd", async () => {
		const expected = path.resolve("/projects/Honomiya/src/cli.ts");
		const result = await resolveHonomiyaCliPath(
			undefined,
			"/projects/Nanahoshi/apps/server",
			async (candidate) => {
				if (candidate !== expected) throw new Error("not found");
			},
		);

		expect(result).toBe(expected);
	});

	test("builds the explicit maximum-quality Modal command with ordered audio", () => {
		expect(
			createHonomiyaAlignCommand({
				cliPath: "/projects/Honomiya/src/cli.ts",
				ebookPath: "/library/book.epub",
				audioPaths: ["/audio/01.m4a", "/audio/02.m4a"],
				outputPath: "/data/alignment.json",
				cacheDir: "/data/cache",
				provider: "modal",
				quality: "accurate",
				parallelChunks: 2,
				retries: 2,
			}),
		).toEqual([
			"bun",
			"/projects/Honomiya/src/cli.ts",
			"align",
			"--ebook",
			"/library/book.epub",
			"--audio",
			"/audio/01.m4a",
			"--audio",
			"/audio/02.m4a",
			"--provider",
			"modal",
			"--quality",
			"accurate",
			"--output",
			"/data/alignment.json",
			"--cache-dir",
			"/data/cache",
			"--parallel-chunks",
			"2",
			"--retries",
			"2",
			"--progress-json",
		]);
	});

	test("passes configured speed and retry controls to Honomiya", () => {
		const command = createHonomiyaAlignCommand({
			cliPath: "/projects/Honomiya/src/cli.ts",
			ebookPath: "/library/book.epub",
			audioPaths: ["/audio/book.m4a"],
			outputPath: "/data/alignment.json",
			cacheDir: "/data/cache",
			provider: "modal",
			quality: "fast",
			parallelChunks: 6,
			retries: 4,
		});

		expect(command).toContain("fast");
		expect(command.slice(-5)).toEqual([
			"--parallel-chunks",
			"6",
			"--retries",
			"4",
			"--progress-json",
		]);
	});
});
