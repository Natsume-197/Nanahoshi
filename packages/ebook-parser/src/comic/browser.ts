import type { EbookDocument, EbookFormat } from "../ebook";
import { openZip } from "../zip/browser";
import type { ComicArchive } from "./archive";
import { openComicArchive } from "./document";
import { openSevenZipArchive } from "./sevenzip";

type ComicFormat = Extract<EbookFormat, "cbz" | "cbr" | "cb7">;

export async function openComicDocument(
	blob: Blob,
	format: ComicFormat,
): Promise<EbookDocument> {
	if (format === "cbz") {
		return openComicArchive(zipToComicArchive(await openZip(blob)), format);
	}
	const data = new Uint8Array(await blob.arrayBuffer());
	return openComicArchive(await openSevenZipArchive(data), format);
}

function zipToComicArchive(
	zip: Awaited<ReturnType<typeof openZip>>,
): ComicArchive {
	return {
		names: () => zip.names(),
		read: (name) => zip.bytes(name),
		async close() {},
	};
}
