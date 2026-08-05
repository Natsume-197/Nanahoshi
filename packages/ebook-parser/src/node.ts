import fs from "node:fs/promises";
import { openComicFile } from "./comic/node";
import type { EbookDocument, EbookFormat, OpenEbookOptions } from "./ebook";
import { openEpubArchive } from "./epub/document";
import { UnsupportedFormatError } from "./errors";
import { openFb2Archive } from "./fb2/archive";
import { parseFb2Document } from "./fb2/document";
import { ebookFormatFromFilename, isSupportedEbookFormat } from "./formats";
import { openMobiDocument } from "./mobi/document";
import { normalizeOpenError } from "./normalize-error";
import { openZipFile } from "./zip/node";

export async function openEbookFile(
	filePath: string,
	options: OpenEbookOptions = {},
): Promise<EbookDocument> {
	const format =
		options.formatHint ?? ebookFormatFromFilename(options.filename ?? filePath);
	if (!format || !isSupportedEbookFormat(format)) {
		throw new UnsupportedFormatError(
			format
				? `Ebook format is not implemented yet: ${format}`
				: `Could not detect ebook format: ${filePath}`,
		);
	}

	try {
		if (format === "epub" || format === "kepub") {
			return await openEpubFile(filePath, format);
		}
		if (format === "fb2") return await openFb2File(filePath);
		if (format === "cbz" || format === "cbr" || format === "cb7") {
			return await openComicFile(filePath, format);
		}
		return openMobiDocument(await fs.readFile(filePath), format);
	} catch (error) {
		throw normalizeOpenError(error, format);
	}
}

async function openEpubFile(
	filePath: string,
	format: Extract<EbookFormat, "epub" | "kepub">,
): Promise<EbookDocument> {
	return openEpubArchive(await openZipFile(filePath), format);
}

async function openFb2File(filePath: string): Promise<EbookDocument> {
	if (await hasZipSignature(filePath)) {
		return openFb2Archive(await openZipFile(filePath));
	}
	return parseFb2Document(await fs.readFile(filePath));
}

async function hasZipSignature(filePath: string): Promise<boolean> {
	const handle = await fs.open(filePath, "r");
	try {
		const signature = new Uint8Array(4);
		const { bytesRead } = await handle.read(signature, 0, 4, 0);
		return (
			bytesRead === 4 &&
			signature[0] === 0x50 &&
			signature[1] === 0x4b &&
			((signature[2] === 0x03 && signature[3] === 0x04) ||
				(signature[2] === 0x05 && signature[3] === 0x06) ||
				(signature[2] === 0x07 && signature[3] === 0x08))
		);
	} finally {
		await handle.close();
	}
}
