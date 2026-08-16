import { openEbook } from "@nanahoshi-v2/ebook-parser";
import type { ReaderBookData } from "@/features/reader/document/types";
import { adaptHtmlEbook } from "./html-ebook.adapter";
import { adaptPagedEbook } from "./paged-ebook.adapter";
import type { ReaderBookFacts } from "./reader-book-cache";

export async function loadEbook(
	uuid: string,
	blob: Blob,
	filename: string,
	fallbackTitle: string,
	document: Document,
	readerFacts?: ReaderBookFacts,
): Promise<ReaderBookData> {
	const ebook = await openEbook(blob, { filename });
	return ebook.content.kind === "pages"
		? adaptPagedEbook(ebook, uuid, fallbackTitle, document)
		: adaptHtmlEbook(ebook, uuid, fallbackTitle, document, readerFacts);
}
