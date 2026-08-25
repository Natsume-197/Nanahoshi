import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
	createHonomiyaAlignCommand,
	resolveHonomiyaCliPath,
} from "../honomiya-process";

describe("Honomiya process boundary", () => {
	test("prefers the CLI bundled in production images", async () => {
		const expected = "/opt/honomiya/cli.js";
		const checked: string[] = [];
		const result = await resolveHonomiyaCliPath(
			undefined,
			"/app/apps/server",
			async (candidate) => {
				checked.push(candidate);
				if (candidate !== expected) throw new Error("not found");
			},
		);

		expect(result).toBe(expected);
		expect(checked).toEqual([expected]);
	});

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
			"--cache-dir",
			"/data/cache",
			"--parallel-chunks",
			"2",
			"--retries",
			"2",
			"--output",
			"/data/alignment.json",
			"--progress-json",
		]);
	});

	test("builds a local transcription command without changing quality controls", () => {
		const command = createHonomiyaAlignCommand({
			cliPath: "/opt/honomiya/cli.ts",
			ebookPath: "/library/book.epub",
			audioPaths: ["/library/track.mp3"],
			outputPath: "/work/alignment.json",
			cacheDir: "/work/cache",
			provider: "local",
			quality: "accurate",
			parallelChunks: 2,
			retries: 2,
		});

		expect(command).toContain("local");
		expect(
			command.slice(
				command.indexOf("--provider"),
				command.indexOf("--provider") + 2,
			),
		).toEqual(["--provider", "local"]);
		expect(command).toContain("accurate");
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
		expect(command).toContain("6");
		expect(command).toContain("4");
		expect(command.at(-1)).toBe("--progress-json");
	});

	test("builds a timed-text command with Honomiya transcript inputs", () => {
		const command = createHonomiyaAlignCommand({
			cliPath: "/projects/Honomiya/src/cli.ts",
			ebookPath: "/library/book.epub",
			audioPaths: ["/audio/book.m4b"],
			timedTextPaths: ["/audio/book.srt"],
			verifyTimedText: true,
			outputPath: "/data/alignment.json",
			cacheDir: "/data/cache",
			provider: "modal",
			quality: "accurate",
			parallelChunks: 2,
			retries: 2,
		});

		expect(command).toContain("--timed-text");
		expect(command).toContain("/audio/book.srt");
		expect(command).toContain("--verify-provider");
		expect(command).not.toContain("--provider");
	});

	test("uses transcript inputs without invoking a provider", () => {
		const command = createHonomiyaAlignCommand({
			cliPath: "/projects/Honomiya/src/cli.ts",
			ebookPath: "/library/book.epub",
			audioPaths: ["/audio/book.m4b"],
			timedTextPaths: ["/audio/book.srt"],
			outputPath: "/data/alignment.json",
			cacheDir: "/data/cache",
			provider: "modal",
			quality: "accurate",
			parallelChunks: 2,
			retries: 2,
		});

		expect(command).toContain("--timed-text");
		expect(command).not.toContain("--verify-provider");
	});
});
