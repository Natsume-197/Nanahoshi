import fs from "node:fs/promises";
import path from "node:path";

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
		console.log(
			`[Converter] ebook-convert found (${ebookConvertCmd[0] === "flatpak" ? "Flatpak" : "native"}). AZW3 conversion is enabled.`,
		);
	} else {
		console.warn(
			"[Converter] ⚠ ebook-convert not found. AZW3 files will be skipped. Install Calibre to enable conversion: https://calibre-ebook.com/download",
		);
	}

	return ebookConvertCmd !== null;
}

export function isConversionAvailable(): boolean {
	return ebookConvertCmd !== null;
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

	const proc = Bun.spawn([...ebookConvertCmd, sourcePath, outputPath], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(
			`ebook-convert failed with exit code ${exitCode}: ${stderr}`,
		);
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
