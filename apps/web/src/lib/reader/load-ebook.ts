import { openEbook } from "@nanahoshi-v2/ebook-parser";
import { adaptHtmlEbook } from "./html-ebook.adapter";
import { adaptPagedEbook } from "./paged-ebook.adapter";
import type { ReaderBookData } from "./types";

export async function loadEbook(
	uuid: string,
	blob: Blob,
	filename: string,
	fallbackTitle: string,
	document: Document,
): Promise<ReaderBookData> {
	const ebook = await openEbook(blob, { filename });
	return ebook.content.kind === "pages"
		? adaptPagedEbook(ebook, uuid, fallbackTitle, document)
		: adaptHtmlEbook(ebook, uuid, fallbackTitle, document);
}
