import type { PdfEngine } from "@embedpdf/engines";
import type {
	PdfDocumentObject,
	PdfFile,
	PdfMetadataObject,
} from "@embedpdf/models";
import type { EbookDocument, EbookMetadata, EbookResource } from "../ebook";

const PAGE_ID_PREFIX = "page-";
const COVER_MAX_EDGE = 1_600;
const MAX_RENDER_SCALE = 2;
const TEXT_SAMPLE_PAGES = 12;

export async function openPdfEbookDocument<TImage>(
	engine: PdfEngine<TImage>,
	file: PdfFile,
	imageBytes: (image: TImage) => Promise<Uint8Array>,
): Promise<EbookDocument> {
	let pdf: PdfDocumentObject | undefined;
	try {
		pdf = await engine.openDocumentBuffer(file).toPromise();
		return await createPdfEbookDocument(engine, pdf, imageBytes);
	} catch (error) {
		await Promise.allSettled([
			...(pdf ? [engine.closeDocument(pdf).toPromise()] : []),
			engine.destroy().toPromise(),
		]);
		throw error;
	}
}

async function createPdfEbookDocument<TImage>(
	engine: PdfEngine<TImage>,
	pdf: PdfDocumentObject,
	imageBytes: (image: TImage) => Promise<Uint8Array>,
): Promise<EbookDocument> {
	const metadata = await engine.getMetadata(pdf).toPromise();
	const pages = pdf.pages.map((page) => ({
		id: `${PAGE_ID_PREFIX}${page.index + 1}`,
		label: `Page ${page.index + 1}`,
	}));

	const openPage = async (id: string): Promise<EbookResource | undefined> => {
		const pageIndex = pageIndexFromId(id, pdf.pageCount);
		if (pageIndex === null) return undefined;
		const page = pdf.pages[pageIndex];
		if (!page) return undefined;
		const longestEdge = Math.max(page.size.width, page.size.height);
		const scaleFactor = Math.max(
			0.1,
			Math.min(
				MAX_RENDER_SCALE,
				longestEdge > 0 ? COVER_MAX_EDGE / longestEdge : 1,
			),
		);
		const image = await engine
			.renderPage(pdf, page, {
				scaleFactor,
				imageType: "image/png",
				withAnnotations: true,
			})
			.toPromise();
		return { data: await imageBytes(image), mediaType: "image/png" };
	};

	let closed = false;
	return {
		format: "pdf",
		metadata: ebookMetadata(metadata, pdf.id),
		content: {
			kind: "pages",
			pages,
			openPage,
			async sampleText() {
				const pageIndexes = samplePageIndexes(pdf.pageCount);
				const text = await engine.extractText(pdf, pageIndexes).toPromise();
				return {
					textLength: text.trim().length,
					sampledPages: pageIndexes.length,
				};
			},
		},
		openCover: () => openPage(`${PAGE_ID_PREFIX}1`),
		async close() {
			if (closed) return;
			closed = true;
			await engine.closeDocument(pdf).toPromise();
			await engine.destroy().toPromise();
		},
	};
}

export async function pdfDocumentId(bytes: Uint8Array): Promise<string> {
	const source =
		bytes.buffer instanceof ArrayBuffer &&
		bytes.byteOffset === 0 &&
		bytes.byteLength === bytes.buffer.byteLength
			? bytes.buffer
			: Uint8Array.from(bytes).buffer;
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", source));
	const hex = Array.from(digest, (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	return `pdf-sha256-${hex.slice(0, 48)}`;
}

function samplePageIndexes(pageCount: number): number[] {
	const sampleCount = Math.min(TEXT_SAMPLE_PAGES, pageCount);
	const stride = pageCount / Math.max(sampleCount, 1);
	return Array.from({ length: sampleCount }, (_, index) =>
		Math.floor(index * stride),
	);
}

function pageIndexFromId(id: string, pageCount: number): number | null {
	if (!id.startsWith(PAGE_ID_PREFIX)) return null;
	const pageNumber = Number.parseInt(id.slice(PAGE_ID_PREFIX.length), 10);
	return Number.isInteger(pageNumber) &&
		pageNumber >= 1 &&
		pageNumber <= pageCount
		? pageNumber - 1
		: null;
}

function ebookMetadata(
	metadata: PdfMetadataObject,
	identifier: string,
): EbookMetadata {
	return {
		identifier,
		identifiers: identifier ? [{ value: identifier, scheme: "PDF" }] : [],
		title: metadata.title?.trim() ?? "",
		subtitle: "",
		authors: people(metadata.author ?? ""),
		publisher: "",
		language: "",
		published: metadata.creationDate
			? metadata.creationDate.toISOString().slice(0, 10)
			: "",
		description: metadata.subject?.trim() ?? "",
		subjects: splitValues(metadata.keywords ?? ""),
		rights: "",
		contributors: [],
		presentation: {
			layout: "pre-paginated",
			spread: null,
			declaresPageResolution: true,
			pageProgressionDirection: "ltr",
		},
	};
}

function people(value: string): string[] {
	return unique(value.split(/\s*(?:;|\n|\band\b)\s*/i).filter(Boolean));
}

function splitValues(value: string): string[] {
	return unique(value.split(/\s*(?:,|;|\n)\s*/).filter(Boolean));
}

function unique(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
