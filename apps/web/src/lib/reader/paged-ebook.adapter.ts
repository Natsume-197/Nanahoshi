import type { EbookDocument } from "@nanahoshi-v2/ebook-parser";
import { formatStyleSheet } from "./format-style-sheet";
import { recountBookData } from "./recount-book-data";
import { sanitizeStoredBookHtml } from "./sanitize-html";
import {
	BOOK_CONTENT_FORM_VERSION,
	BOOK_COUNT_VERSION,
	BOOK_RESOURCE_VERSION,
	BOOK_SANITIZE_VERSION,
	type ReaderBookData,
	type ReaderSourceFormat,
	type Section,
} from "./types";

const COMIC_STYLES = `
.ttu-comic-page,
.ttu-comic-page-body,
.ttu-comic-page-html {
	margin: 0;
	padding: 0;
}
.ttu-comic-page {
	display: flex;
	align-items: center;
	justify-content: center;
	break-inside: avoid;
}
.ttu-comic-page img {
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
		const root = document.createElement("div");
		const sections: Section[] = [];

		for (const [index, pageRef] of ebook.content.pages.entries()) {
			const page = await ebook.content.openPage(pageRef.id);
			if (!page) continue;
			const key = `${sourceFormat}/page-${String(index + 1).padStart(4, "0")}${extensionFor(page.mediaType)}`;
			blobs[key] = new Blob([Uint8Array.from(page.data)], {
				type: page.mediaType,
			});

			const image = document.createElement("img");
			image.src = `ttu:${key}`;
			image.alt = pageRef.label ?? `Page ${index + 1}`;
			image.loading = "lazy";
			image.decoding = "async";

			const pageContainer = document.createElement("div");
			pageContainer.className = "ttu-comic-page";
			pageContainer.appendChild(image);

			const body = document.createElement("div");
			body.className = "ttu-book-body-wrapper ttu-comic-page-body ttu-no-text";
			body.appendChild(pageContainer);

			const html = document.createElement("div");
			html.className = "ttu-book-html-wrapper ttu-comic-page-html ttu-no-text";
			html.appendChild(body);

			const wrapper = document.createElement("div");
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
			contentFormVersion: BOOK_CONTENT_FORM_VERSION,
			resourceVersion: BOOK_RESOURCE_VERSION,
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
			storedAt: Date.now(),
			countVersion: BOOK_COUNT_VERSION,
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
	return `ttu-${format}-${index + 1}-${safeId}`;
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
