import type { EbookDocument, EbookFormat } from "../ebook";
import type { ZipArchive } from "../zip/archive";
import { openZip } from "../zip/browser";
import { openEpubArchive } from "./document";

export async function openEpubDocument(
	blob: Blob,
	format: Extract<EbookFormat, "epub" | "kepub"> = "epub",
): Promise<EbookDocument> {
	const zip = await openZip(blob);
	const archive: ZipArchive = {
		has: (name) => zip.has(name),
		names: () => zip.names(),
		text: (name) => zip.text(name),
		bytes: (name) => zip.bytes(name),
		async close() {},
	};
	return openEpubArchive(archive, format);
}
