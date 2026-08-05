import fs from "node:fs/promises";
import type { EbookDocument, EbookFormat } from "../ebook";
import { openZipFile } from "../zip/node";
import { openComicArchive } from "./document";
import { openSevenZipArchive } from "./sevenzip";

type ComicFormat = Extract<EbookFormat, "cbz" | "cbr" | "cb7">;

export async function openComicFile(
	filePath: string,
	format: ComicFormat,
): Promise<EbookDocument> {
	if (format === "cbz") {
		const zip = await openZipFile(filePath);
		return openComicArchive(
			{
				names: () => zip.names(),
				read: (name) => zip.bytes(name),
				close: () => zip.close(),
			},
			format,
		);
	}
	const data = Uint8Array.from(await fs.readFile(filePath));
	return openComicArchive(await openSevenZipArchive(data), format);
}
