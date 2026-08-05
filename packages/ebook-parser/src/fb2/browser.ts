import type { EbookDocument } from "../ebook";
import type { ZipArchive } from "../zip/archive";
import { openZip } from "../zip/browser";
import { openFb2Archive } from "./archive";
import { parseFb2Document } from "./document";

export async function openFb2Document(blob: Blob): Promise<EbookDocument> {
	const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
	if (isZipSignature(signature)) {
		const zip = await openZip(blob);
		const archive: ZipArchive = {
			has: (name) => zip.has(name),
			names: () => zip.names(),
			text: (name) => zip.text(name),
			bytes: (name) => zip.bytes(name),
			async close() {},
		};
		return openFb2Archive(archive);
	}
	return parseFb2Document(await blob.arrayBuffer());
}

function isZipSignature(bytes: Uint8Array): boolean {
	return (
		bytes[0] === 0x50 &&
		bytes[1] === 0x4b &&
		((bytes[2] === 0x03 && bytes[3] === 0x04) ||
			(bytes[2] === 0x05 && bytes[3] === 0x06) ||
			(bytes[2] === 0x07 && bytes[3] === 0x08))
	);
}
