import type { EbookDocument } from "@nanahoshi-v2/ebook-parser";
import { formatStyleSheet } from "@/features/reader/document/processing/format-style-sheet";
import { recountBookData } from "@/features/reader/document/processing/recount-book-data";
import { sanitizeStoredBookHtml } from "@/features/reader/document/processing/sanitize-html";
import {
	BOOK_SANITIZE_VERSION,
	type ReaderBookData,
	type ReaderSourceFormat,
	type Section,
} from "@/features/reader/document/types";

const COMIC_STYLES = `
.nanahoshi-comic-page,
.nanahoshi-comic-page-body,
.nanahoshi-comic-page-html {
	margin: 0;
	padding: 0;
}
.nanahoshi-comic-page {
	display: flex;
	align-items: center;
	justify-content: center;
	break-inside: avoid;
}
.nanahoshi-comic-page img {
	display: block;
	margin: auto;
	object-fit: contain;
}
`.trim();

export async function adaptPagedEbook(
	ebook: EbookDocument,
	uuid: string,
	fallbackTitle: string,
	document: Document,
): Promise<ReaderBookData> {
	try {
		if (ebook.content.kind !== "pages") {
			throw new Error(`Reader content is not paged: ${ebook.content.kind}`);
		}

		const sourceFormat = ebook.format as ReaderSourceFormat;
		const blobs: Record<string, Blob> = {};
		const staging = document.implementation.createHTMLDocument("");
		const root = staging.createElement("div");
		const sections: Section[] = [];

		for (const [index, pageRef] of ebook.content.pages.entries()) {
			const page = await ebook.content.openPage(pageRef.id);
			if (!page) continue;
			const key = `${sourceFormat}/page-${String(index + 1).padStart(4, "0")}${extensionFor(page.mediaType)}`;
			blobs[key] = new Blob([Uint8Array.from(page.data)], {
				type: page.mediaType,
			});

			const image = staging.createElement("img");
			image.src = `nanahoshi:${key}`;
			image.alt = pageRef.label ?? `Page ${index + 1}`;
			image.loading = "lazy";
			image.decoding = "async";

			const pageContainer = staging.createElement("div");
			pageContainer.className = "nanahoshi-comic-page";
			pageContainer.appendChild(image);

			const body = staging.createElement("div");
			body.className =
				"nanahoshi-book-body-wrapper nanahoshi-comic-page-body nanahoshi-no-text";
			body.appendChild(pageContainer);

			const html = staging.createElement("div");
			html.className =
				"nanahoshi-book-html-wrapper nanahoshi-comic-page-html nanahoshi-no-text";
			html.appendChild(body);

			const wrapper = staging.createElement("div");
			wrapper.id = sectionReference(sourceFormat, pageRef.id, index);
			wrapper.appendChild(html);
			root.appendChild(wrapper);
			sections.push({
				reference: wrapper.id,
				charactersWeight: 1,
				label: pageRef.label,
			});
		}

		if (!sections.length) throw new Error("Comic contains no readable pages");
		const base: ReaderBookData = {
			uuid,
			sourceFormat,
			contentForm: "images",
			presentation: ebook.metadata.presentation ?? {
				layout: "pre-paginated",
				declaresPageResolution: true,
			},
			title: ebook.metadata.title.trim() || fallbackTitle,
			language: normalizeLanguage(ebook.metadata.language) || "ja",
			elementHtml: sanitizeStoredBookHtml(root).innerHTML,
			styleSheet: formatStyleSheet(COMIC_STYLES, ".book-content"),
			blobs,
			characters: 0,
			sections,
			sanitizeVersion: BOOK_SANITIZE_VERSION,
		};
		return recountBookData(base, document);
	} finally {
		await ebook.close();
	}
}

function sectionReference(
	format: ReaderSourceFormat,
	id: string,
	index: number,
): string {
	const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
	return `nanahoshi-${format}-${index + 1}-${safeId}`;
}

function normalizeLanguage(value: string): string {
	const primary = value.trim().split(/[-_]/)[0]?.toLowerCase() ?? "";
	return /^[a-z]{2,8}$/.test(primary) ? primary : "";
}

function extensionFor(mediaType: string): string {
	return (
		{
			"image/avif": ".avif",
			"image/bmp": ".bmp",
			"image/gif": ".gif",
			"image/jpeg": ".jpg",
			"image/png": ".png",
			"image/webp": ".webp",
		}[mediaType] ?? ""
	);
}
