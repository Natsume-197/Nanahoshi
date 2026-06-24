import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../lib/logger";

const log = logger.child({ component: "converter" });

const CONVERTED_DIR = path.join(process.cwd(), "data/converted");

const CONVERTIBLE_EXTENSIONS = new Set([".azw3"]);

let ebookConvertCmd: string[] | null = null;

async function tryCommand(cmd: string[]): Promise<boolean> {
	try {
		const proc = Bun.spawn([...cmd, "--version"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		return (await proc.exited) === 0;
	} catch {
		return false;
	}
}

export async function checkEbookConvertAvailable(): Promise<boolean> {
	// Try native binary first, then Flatpak
	if (await tryCommand(["ebook-convert"])) {
		ebookConvertCmd = ["ebook-convert"];
	} else if (
		await tryCommand([
			"flatpak",
			"run",
			"--command=ebook-convert",
			"com.calibre_ebook.calibre",
		])
	) {
		ebookConvertCmd = [
			"flatpak",
			"run",
			"--command=ebook-convert",
			"com.calibre_ebook.calibre",
		];
	}

	if (ebookConvertCmd) {
		log.info(
			{ source: ebookConvertCmd[0] === "flatpak" ? "Flatpak" : "native" },
			"ebook-convert found. AZW3 conversion is enabled.",
		);
	} else {
		log.warn(
			"ebook-convert not found. AZW3 files will be skipped. Install Calibre to enable conversion: https://calibre-ebook.com/download",
		);
	}

	return ebookConvertCmd !== null;
}

export function isConversionAvailable(): boolean {
	return ebookConvertCmd !== null;
}

export function getEbookConvertCmd(): string[] {
	if (!ebookConvertCmd) {
		throw new Error("ebook-convert is not available");
	}
	return ebookConvertCmd;
}

export function needsConversion(filename: string): boolean {
	const ext = path.extname(filename).toLowerCase();
	return CONVERTIBLE_EXTENSIONS.has(ext);
}

export function getConvertedEpubPath(uuid: string): string {
	return path.join(CONVERTED_DIR, `${uuid}.epub`);
}

export async function convertToEpub(
	sourcePath: string,
	uuid: string,
): Promise<string> {
	if (!ebookConvertCmd) {
		throw new Error(
			"ebook-convert is not available. Install Calibre to enable AZW3 conversion.",
		);
	}

	await fs.mkdir(CONVERTED_DIR, { recursive: true });

	const outputPath = getConvertedEpubPath(uuid);

	// Skip if already converted
	try {
		await fs.access(outputPath);
		return outputPath;
	} catch {
		// File doesn't exist, proceed with conversion
	}

	const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

	const proc = Bun.spawn([...ebookConvertCmd, sourcePath, outputPath], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const exitCode = await Promise.race([
		proc.exited,
		new Promise<never>((_, reject) =>
			setTimeout(() => {
				proc.kill();
				reject(
					new Error(`ebook-convert timed out after ${TIMEOUT_MS / 1000}s`),
				);
			}, TIMEOUT_MS),
		),
	]);

	if (exitCode !== 0) {
		// Clean up partial output on failure
		try {
			await fs.unlink(outputPath);
		} catch {
			// File may not exist
		}
		const stderr = await new Response(proc.stderr).text();
		throw new Error(
			`ebook-convert failed with exit code ${exitCode}: ${stderr}`,
		);
	}

	// Verify output is valid
	const stat = await fs.stat(outputPath);
	if (stat.size === 0) {
		await fs.unlink(outputPath);
		throw new Error("ebook-convert produced an empty file");
	}

	return outputPath;
}

export async function removeConvertedFile(uuid: string): Promise<void> {
	const filePath = getConvertedEpubPath(uuid);
	try {
		await fs.unlink(filePath);
	} catch {
		// File doesn't exist, nothing to clean up
	}
}

const EXTENSION_TO_MEDIA_TYPE: Record<string, string> = {
	".epub": "application/epub+zip",
	".azw3": "application/x-mobi8-ebook",
};

export function getMediaTypeForExtension(filename: string): string | null {
	const ext = path.extname(filename).toLowerCase();
	return EXTENSION_TO_MEDIA_TYPE[ext] ?? null;
}
