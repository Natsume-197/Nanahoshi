import { openEbookFile } from "@nanahoshi-v2/ebook-parser/node";
import type {
	EbookContent,
	EbookMetadata,
	EbookResource,
	HtmlContent,
} from "@nanahoshi-v2/ebook-parser/types";
import { load } from "cheerio";
import { acquireCover } from "../../../../lib/cover-store";
import {
	type ContentForm,
	contentFormTextBudget,
	htmlBodyTextLength,
	htmlImageCount,
	resolveContentForm,
} from "../../../../modules/catalogContentForm";
import {
	isUsableEmbeddedUid,
	isValidAsin,
	isValidIsbn10,
	isValidIsbn13,
	normalizeAsin,
	normalizeEmbeddedUid,
	normalizeIsbn,
} from "../../../../modules/identifiers";

const CONTENT_FORM_SAMPLE_DOCUMENTS = 12;

export interface LocalEbookMetadata {
	title: string;
	subtitle: string | null;
	authors: string[];
	publisher: string | null;
	language: string;
	publishedDate?: string;
	description: string | null;
	asin: string | null;
	isbn10: string | null;
	isbn13: string | null;
	embeddedUid: string | null;
	cover: string | null;
	contentForm: ContentForm;
	pageCount: number | null;
}

export async function readLocalEbook(
	filePath: string,
	bookUuid: string,
): Promise<LocalEbookMetadata> {
	const ebook = await openEbookFile(filePath);
	try {
		const metadata = ebook.metadata;
		const identifiers = classifyEbookIdentifiers(metadata);
		const [cover, contentForm] = await Promise.all([
			acquireEbookCover(ebook.openCover(), bookUuid),
			measureContentForm(ebook.content, metadata),
		]);

		return {
			title: decodeText(metadata.title),
			subtitle: decodeText(metadata.subtitle) || null,
			authors: metadata.authors.map(decodeText).filter(Boolean),
			publisher: decodeText(metadata.publisher) || null,
			language: normalizeLanguage(metadata.language),
			publishedDate: metadata.published || undefined,
			description: metadata.description || null,
			...identifiers,
			cover,
			contentForm,
			pageCount:
				ebook.content.kind === "pages" ? ebook.content.pages.length : null,
		};
	} finally {
		await ebook.close();
	}
}

async function acquireEbookCover(
	coverPromise: Promise<EbookResource | undefined>,
	bookUuid: string,
): Promise<string | null> {
	const cover = await coverPromise;
	return cover
		? acquireCover(
				Buffer.from(cover.data),
				bookUuid,
				extensionFor(cover.mediaType),
			)
		: null;
}

export async function measureContentForm(
	source: EbookContent,
	metadata?: Pick<EbookMetadata, "presentation">,
): Promise<ContentForm> {
	if (source.kind === "pages") {
		if (!source.sampleText) return "images";
		try {
			const sample = await source.sampleText();
			if (sample.sampledPages <= 0) return "text";
			return sample.textLength >= contentFormTextBudget(sample.sampledPages)
				? "text"
				: "images";
		} catch {
			return "text";
		}
	}
	let sections: HtmlContent["sections"];
	try {
		sections = source.sections;
	} catch {
		return "text";
	}
	const declaration = metadata?.presentation ?? {};
	if (!sections.length) return resolveContentForm(declaration);

	const planned = Math.min(CONTENT_FORM_SAMPLE_DOCUMENTS, sections.length);
	const budget = contentFormTextBudget(planned);
	const stride = sections.length / planned;
	let textLength = 0;
	let sampledDocuments = 0;
	let imageCount = 0;

	for (let index = 0; index < planned; index++) {
		const section = sections[Math.floor(index * stride)];
		if (!section) continue;
		let html = "";
		try {
			html = (await source.openSection(section.id))?.html ?? "";
		} catch {
			continue;
		}
		if (!html) continue;
		sampledDocuments++;
		textLength += htmlBodyTextLength(html);
		imageCount += htmlImageCount(html);
		if (textLength >= budget) return "text";
	}

	return resolveContentForm(declaration, {
		textLength,
		sampledDocuments,
		imageCount,
		documentCount: sampledDocuments,
	});
}

export function classifyEbookIdentifiers(
	metadata: Pick<EbookMetadata, "identifier" | "identifiers">,
) {
	let asin: string | null = null;
	let isbn10: string | null = null;
	let isbn13: string | null = null;
	let fallbackUid: string | null = null;
	let primaryUid: string | null = null;

	const identifiers = metadata.identifiers.length
		? metadata.identifiers
		: [{ value: metadata.identifier }];
	for (const identifier of identifiers) {
		const raw = identifier.value.trim();
		if (!raw) continue;
		const urn = raw.match(/^urn:(isbn|asin):\s*(.+)$/i);
		const value = urn?.[2] ?? raw;
		const scheme = `${urn?.[1] ?? ""} ${identifier.scheme ?? ""}`.toUpperCase();
		const labeled = /ISBN|ASIN|AMAZON/.test(scheme);

		if (!asin && isValidAsin(value)) asin = normalizeAsin(value);
		else if (!isbn13 && isValidIsbn13(value)) isbn13 = normalizeIsbn(value);
		else if (!isbn10 && labeled && isValidIsbn10(value)) {
			isbn10 = normalizeIsbn(value);
		} else if (isUsableEmbeddedUid(raw)) {
			const uid = normalizeEmbeddedUid(raw);
			if (raw === metadata.identifier) primaryUid ??= uid;
			fallbackUid ??= uid;
		}
	}

	return {
		asin,
		isbn10,
		isbn13,
		embeddedUid: asin || isbn10 || isbn13 ? null : (primaryUid ?? fallbackUid),
	};
}

function decodeText(value: string): string {
	return value ? load(`<span>${value}</span>`)("span").text().trim() : "";
}

function normalizeLanguage(value: string): string {
	const primary = value.trim().split(/[-_]/)[0]?.toLowerCase() ?? "";
	return /^[a-z]{2,8}$/.test(primary) ? primary : "";
}

function extensionFor(mediaType: string): string {
	return (
		{
			"image/jpeg": ".jpg",
			"image/png": ".png",
			"image/gif": ".gif",
			"image/webp": ".webp",
			"image/svg+xml": ".svg",
		}[mediaType] ?? ".bin"
	);
}
