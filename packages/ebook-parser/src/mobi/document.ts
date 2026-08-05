import type {
	EbookDocument,
	EbookFormat,
	EbookMetadata,
	HtmlNavigationItem,
} from "../ebook";
import { openMobi } from "./index";
import type { MobiMetadata, MobiSource } from "./types";

const INTERNAL_LINK = /(<a\b[^>]*\shref\s*=\s*)(["'])(.*?)\2/gi;

export function openMobiDocument(
	input: ArrayBuffer | Uint8Array,
	formatHint?: Extract<EbookFormat, "mobi" | "azw" | "azw3">,
): EbookDocument {
	const source = openMobi(input);
	const format = formatHint ?? source.format;

	return {
		format,
		metadata: metadataFromMobi(source.metadata),
		content: {
			kind: "html",
			sections: source.sections,
			toc: normalizeToc(source.toc, source),
			async openSection(id) {
				const section = source.loadSection(id);
				return section
					? {
							html: rewriteInternalLinks(section.html, source),
							styles: section.styles,
						}
					: undefined;
			},
			async openResource(href) {
				return source.loadResource(href);
			},
		},
		async openCover() {
			return source.getCover();
		},
		async close() {},
	};
}

function metadataFromMobi(metadata: MobiMetadata): EbookMetadata {
	const identifiers = [
		{ value: metadata.identifier },
		{ value: metadata.asin, scheme: "ASIN" },
		{ value: metadata.isbn, scheme: "ISBN" },
	].filter((entry) => entry.value.trim().length > 0);

	return {
		identifier: metadata.identifier,
		identifiers,
		title: metadata.title,
		subtitle: "",
		authors: metadata.authors,
		publisher: metadata.publisher,
		language: metadata.language,
		published: metadata.published,
		description: metadata.description,
		subjects: metadata.subjects,
		rights: metadata.rights,
		contributors: metadata.contributors,
	};
}

function normalizeToc(
	items: MobiSource["toc"],
	source: MobiSource,
): HtmlNavigationItem[] {
	return items.map((item) => {
		const resolved = safeResolve(source, item.href);
		return {
			label: item.label,
			target: resolved
				? { sectionId: resolved.id, selector: resolved.selector || undefined }
				: undefined,
			children: item.children ? normalizeToc(item.children, source) : undefined,
		};
	});
}

function rewriteInternalLinks(html: string, source: MobiSource): string {
	return html.replace(
		INTERNAL_LINK,
		(match, prefix: string, quote: string, href: string) => {
			const resolved = safeResolve(source, href);
			return resolved
				? `${prefix}${quote}ebook-section:${encodeURIComponent(resolved.id)}${quote}`
				: match;
		},
	);
}

function safeResolve(source: MobiSource, href: string) {
	try {
		return source.resolveHref(href);
	} catch {
		return undefined;
	}
}
