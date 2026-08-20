import { openEbookFile } from "@nanahoshi-v2/ebook-parser/node";
import type {
	EbookContent,
	EbookMetadata,
	EbookResource,
	HtmlContent,
} from "@nanahoshi-v2/ebook-parser/types";
import { load } from "cheerio";
import sharp from "sharp";
import {
	acquireCover,
	replaceAcquiredCover,
} from "../../../../lib/cover-store";
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
const COVER_CANDIDATE_SECTIONS = 6;
const COVER_CANDIDATE_LIMIT = 24;

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
	options: { replaceCover?: boolean } = {},
): Promise<LocalEbookMetadata> {
	const ebook = await openEbookFile(filePath);
	try {
		const metadata = ebook.metadata;
		const identifiers = classifyEbookIdentifiers(metadata);
		const [cover, contentForm] = await Promise.all([
			acquireEbookCover(ebook.openCover(), ebook.content, bookUuid, options),
			measureContentForm(ebook.content, metadata),
		]);

		return {
			title: sanitizeEmbeddedTitle(decodeText(metadata.title)),
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
	content: EbookContent,
	bookUuid: string,
	options: { replaceCover?: boolean },
): Promise<string | null> {
	const declared = await coverPromise;
	const cover =
		declared && (await isUsableDeclaredCover(declared.data))
			? declared
			: content.kind === "html"
				? await findFallbackCover(content)
				: undefined;
	const store = options.replaceCover ? replaceAcquiredCover : acquireCover;
	return cover
		? store(Buffer.from(cover.data), bookUuid, extensionFor(cover.mediaType))
		: null;
}

async function isUsableDeclaredCover(data: Uint8Array): Promise<boolean> {
	try {
		await sharp(Buffer.from(data)).metadata();
		return !(await isBlankCover(data));
	} catch {
		return false;
	}
}

type CoverReference = {
	href: string;
	sectionIndex: number;
	documentOrder: number;
	semantic: boolean;
};

/**
 * Finds cover-like art only in the opening publication matter. Candidates are
 * parsed from markup and ranked by semantic filename, position, proportions,
 * resolution and visual information; logos and near-white placeholders fail
 * the hard quality boundary before ranking.
 */
export async function findFallbackCover(
	content: HtmlContent,
): Promise<EbookResource | undefined> {
	const references: CoverReference[] = [];
	for (const [sectionIndex, section] of content.sections
		.slice(0, COVER_CANDIDATE_SECTIONS)
		.entries()) {
		let html: string;
		try {
			html = (await content.openSection(section.id))?.html ?? "";
		} catch {
			continue;
		}
		for (const [documentOrder, href] of imageReferences(html).entries()) {
			references.push({
				href,
				sectionIndex,
				documentOrder,
				semantic: isSemanticCoverReference(href),
			});
		}
	}

	// Rank on markup evidence before decoding. This keeps the expensive image
	// probe bounded to the first candidate that also crosses the quality gate.
	references.sort(
		(a, b) =>
			Number(b.semantic) - Number(a.semantic) ||
			a.sectionIndex - b.sectionIndex ||
			a.documentOrder - b.documentOrder,
	);
	for (const candidate of references.slice(0, COVER_CANDIDATE_LIMIT)) {
		const resource = await content
			.openResource(candidate.href)
			.catch(() => undefined);
		if (resource && (await isFallbackCoverCandidate(resource.data))) {
			return resource;
		}
	}
	return undefined;
}

function isSemanticCoverReference(href: string): boolean {
	return /(?:^|[/_-])(cover|front|表紙)(?:[._-]|$)/i.test(href);
}

function imageReferences(html: string): string[] {
	const $ = load(html);
	const references: string[] = [];
	$("img, source, image, [style]").each((_, element) => {
		const node = $(element);
		const direct =
			node.attr("src") ?? node.attr("href") ?? node.attr("xlink:href");
		if (direct) references.push(direct);
		const srcset = node.attr("srcset");
		if (srcset) {
			for (const entry of srcset.split(",")) {
				const href = entry.trim().split(/\s+/)[0];
				if (href) references.push(href);
			}
		}
		const style = node.attr("style") ?? "";
		for (const match of style.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
			if (match[1]) references.push(match[1]);
		}
	});
	return [...new Set(references)];
}

async function isFallbackCoverCandidate(data: Uint8Array): Promise<boolean> {
	try {
		const image = sharp(Buffer.from(data));
		const [metadata, stats] = await Promise.all([
			image.metadata(),
			image.stats(),
		]);
		const width = metadata.width ?? 0;
		const height = metadata.height ?? 0;
		const ratio = width / height;
		const mean =
			stats.channels.reduce((sum, channel) => sum + channel.mean, 0) /
			stats.channels.length;
		if (
			width < 300 ||
			height < 400 ||
			width * height < 180_000 ||
			ratio < 0.55 ||
			ratio > 0.9 ||
			stats.entropy < 1.5 ||
			(mean > 250 && stats.entropy < 0.5)
		) {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

export async function isBlankCover(data: Uint8Array): Promise<boolean> {
	try {
		const stats = await sharp(Buffer.from(data)).stats();
		const mean =
			stats.channels.reduce((sum, channel) => sum + channel.mean, 0) /
			stats.channels.length;
		return mean > 254 && stats.entropy < 0.1;
	} catch {
		return false;
	}
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

/**
 * Some conversion tools write their source path into dc:title. Treat only
 * unmistakable absolute Windows/Unix paths as transport noise; ordinary book
 * titles containing a slash remain untouched.
 */
export function sanitizeEmbeddedTitle(title: string): string {
	const trimmed = title.trim();
	if (!/^(?:[a-zA-Z]:[\\/]|\/)/.test(trimmed)) return trimmed;

	const basename = trimmed.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
	return basename.replace(/\.(?:epub|mobi|azw3?|fb2|pdf|cb[rz7])$/i, "");
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
