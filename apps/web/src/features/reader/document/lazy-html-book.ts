import type { EbookDocument, HtmlContent } from "@nanahoshi-v2/ebook-parser";
import {
	type FormattedBookHtml,
	formatBookDataHtml,
} from "@/features/reader/document/processing/format-book-data-html";
import {
	BOOK_SANITIZE_VERSION,
	type ReaderBookData,
	type ReaderSourceFormat,
} from "@/features/reader/document/types";
import { adaptHtmlSection, sectionReference } from "./html-ebook.adapter";
import type { ReaderBookFacts } from "./reader-book-cache";

export interface LazyHtmlBook {
	readonly data: ReaderBookData;
	readonly sectionCharacterCounts: readonly number[];
	loadSection(
		index: number,
		imageFitHeight: number,
	): Promise<FormattedBookHtml>;
	close(): Promise<void>;
}

/**
 * A narrow session around an already-open EPUB. Facts provide the stable book
 * outline and character totals; only the requested spine item is unpacked and
 * formatted into DOM-ready HTML.
 */
export async function openLazyHtmlBook({
	ebook,
	uuid,
	fallbackTitle,
	document,
	facts,
}: {
	ebook: EbookDocument;
	uuid: string;
	fallbackTitle: string;
	document: Document;
	facts: ReaderBookFacts;
}): Promise<LazyHtmlBook> {
	const content = ebook.content;
	if (content.kind !== "html") {
		await ebook.close();
		throw new Error("Lazy reading only supports HTML ebook content");
	}
	const sourceFormat = ebook.format as ReaderSourceFormat;
	if (
		facts.sourceFormat !== sourceFormat ||
		!hasMatchingSpine(content, sourceFormat, facts)
	) {
		await ebook.close();
		throw new Error("Cached reader outline no longer matches this book");
	}
	const data: ReaderBookData = {
		uuid,
		sourceFormat,
		contentForm: facts.contentForm,
		presentation: ebook.metadata.presentation,
		title: ebook.metadata.title.trim() || fallbackTitle,
		language: normalizeLanguage(ebook.metadata.language) || "ja",
		elementHtml: "",
		styleSheet: "",
		blobs: {},
		characters: facts.characters,
		sections: facts.sections.map((section) => ({ ...section })),
		sanitizeVersion: BOOK_SANITIZE_VERSION,
	};

	return {
		data,
		sectionCharacterCounts: facts.sectionCharacterCounts,
		async loadSection(index, imageFitHeight) {
			const fact = data.sections[index];
			if (!fact) throw new Error(`Unknown reader section ${index}`);
			const section =
				fact.reference === sectionReference(sourceFormat, "cover")
					? await adaptCover(ebook, sourceFormat, document)
					: await adaptSpineSection(
							content,
							sourceFormat,
							fact.reference,
							document,
						);
			if (!section) throw new Error(`Could not open reader section ${index}`);
			return formatBookDataHtml(
				{
					...data,
					elementHtml: section.elementHtml,
					styleSheet: section.styleSheet,
					blobs: section.blobs,
				},
				document,
				imageFitHeight,
			);
		},
		close: () => ebook.close(),
	};
}

function hasMatchingSpine(
	content: HtmlContent,
	format: ReaderSourceFormat,
	facts: ReaderBookFacts,
) {
	const spineReferences = content.sections.map((section) =>
		sectionReference(format, section.id),
	);
	const known = new Set(facts.sections.map((section) => section.reference));
	const factSpineCount = facts.sections.filter(
		(section) => section.reference !== sectionReference(format, "cover"),
	).length;
	return (
		spineReferences.length === factSpineCount &&
		spineReferences.every((reference) => known.has(reference))
	);
}

async function adaptSpineSection(
	content: HtmlContent,
	format: ReaderSourceFormat,
	reference: string,
	document: Document,
) {
	const source = content.sections.find(
		(section) => sectionReference(format, section.id) === reference,
	);
	return source
		? adaptHtmlSection(content, format, source.id, document)
		: undefined;
}

async function adaptCover(
	ebook: EbookDocument,
	format: ReaderSourceFormat,
	document: Document,
) {
	const cover = await ebook.openCover();
	if (!cover) return undefined;
	const key = `${format}/cover`;
	const wrapper = document.createElement("div");
	wrapper.id = sectionReference(format, "cover");
	wrapper.innerHTML =
		'<div class="nanahoshi-book-html-wrapper nanahoshi-no-text"><div class="nanahoshi-book-body-wrapper nanahoshi-no-text"><img src="nanahoshi:' +
		key +
		'"></div></div>';
	return {
		reference: wrapper.id,
		elementHtml: wrapper.outerHTML,
		styleSheet: "",
		blobs: {
			[key]: new Blob([Uint8Array.from(cover.data)], { type: cover.mediaType }),
		},
	};
}

function normalizeLanguage(value: string): string {
	const primary = value.trim().split(/[-_]/)[0]?.toLowerCase() ?? "";
	return /^[a-z]{2,8}$/.test(primary) ? primary : "";
}
