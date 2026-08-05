import type { EbookDocument } from "../ebook";
import type { ZipArchive } from "../zip/archive";
import { parseFb2Document } from "./document";

export async function openFb2Archive(
	archive: ZipArchive,
): Promise<EbookDocument> {
	try {
		const entry = archive
			.names()
			.find(
				(name) => !name.endsWith("/") && name.toLowerCase().endsWith(".fb2"),
			);
		if (!entry) throw new Error("Invalid FB2 ZIP: missing .fb2 document");
		const bytes = await archive.bytes(entry);
		if (!bytes) throw new Error(`Invalid FB2 ZIP: could not read ${entry}`);
		return parseFb2Document(bytes);
	} finally {
		await archive.close();
	}
}
