import * as fs from "node:fs/promises";
import path from "node:path";

const CLI_RELATIVE_PATH = path.join("Honomiya", "src", "cli.ts");
export const BUNDLED_HONOMIYA_CLI_PATH = "/opt/honomiya/cli.js";

export async function resolveHonomiyaCliPath(
	configuredPath: string | undefined,
	cwd = process.cwd(),
	canRead: (candidate: string) => Promise<unknown> = fs.access,
): Promise<string> {
	if (configuredPath) {
		const resolved = path.resolve(configuredPath);
		await canRead(resolved);
		return resolved;
	}

	try {
		await canRead(BUNDLED_HONOMIYA_CLI_PATH);
		return BUNDLED_HONOMIYA_CLI_PATH;
	} catch {
		// Development uses a sibling checkout; production images bundle the CLI.
	}

	let current = path.resolve(cwd);
	while (true) {
		const candidate = path.join(current, CLI_RELATIVE_PATH);
		try {
			await canRead(candidate);
			return candidate;
		} catch {
			// Continue towards the common parent of Nanahoshi and Honomiya.
		}
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}

	throw new Error(
		"Honomiya CLI was not found; set HONOMIYA_CLI_PATH to its src/cli.ts",
	);
}

export function createHonomiyaAlignCommand(input: {
	cliPath: string;
	ebookPath: string;
	audioPaths: string[];
	outputPath: string;
	cacheDir: string;
	provider: "modal";
	quality: "accurate" | "fast";
	parallelChunks: number;
	retries: number;
}): string[] {
	const command = ["bun", input.cliPath, "align", "--ebook", input.ebookPath];
	for (const audioPath of input.audioPaths) {
		command.push("--audio", audioPath);
	}
	command.push(
		"--provider",
		input.provider,
		"--quality",
		input.quality,
		"--output",
		input.outputPath,
		"--cache-dir",
		input.cacheDir,
		"--parallel-chunks",
		String(input.parallelChunks),
		"--retries",
		String(input.retries),
		"--progress-json",
	);
	return command;
}
