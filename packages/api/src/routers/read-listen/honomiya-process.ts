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
	provider: "local" | "modal";
	quality: "accurate" | "fast";
	parallelChunks: number;
	retries: number;
	timedTextPaths?: string[];
	verifyTimedText?: boolean;
}): string[] {
	const command = ["bun", input.cliPath, "align", "--ebook", input.ebookPath];
	for (const audioPath of input.audioPaths) {
		command.push("--audio", audioPath);
	}
	if (input.timedTextPaths?.length) {
		if (input.timedTextPaths.length !== input.audioPaths.length) {
			throw new Error("Each audio track requires one timed-text source");
		}
		for (const timedTextPath of input.timedTextPaths) {
			command.push("--transcript", timedTextPath);
		}
	} else {
		command.push(
			"--provider",
			input.provider,
			"--quality",
			input.quality,
			"--cache-dir",
			input.cacheDir,
			"--parallel-chunks",
			String(input.parallelChunks),
			"--retries",
			String(input.retries),
		);
	}
	command.push("--output", input.outputPath, "--progress-json");
	return command;
}
