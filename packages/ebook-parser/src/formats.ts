import type { EbookFormat } from "./ebook";

export const SUPPORTED_EBOOK_FORMATS = [
	"epub",
	"kepub",
	"mobi",
	"azw",
	"azw3",
	"fb2",
	"cbz",
	"cbr",
	"cb7",
] as const;

export type SupportedEbookFormat = (typeof SUPPORTED_EBOOK_FORMATS)[number];

const MEDIA_TYPES: Record<EbookFormat, string> = {
	epub: "application/epub+zip",
	kepub: "application/epub+zip",
	mobi: "application/x-mobipocket-ebook",
	azw: "application/vnd.amazon.ebook",
	azw3: "application/vnd.amazon.ebook",
	fb2: "application/x-fictionbook+xml",
	cbz: "application/x-cbz",
	cbr: "application/x-cbr",
	cb7: "application/x-cb7",
	pdf: "application/pdf",
};

export function ebookFormatFromFilename(filename: string): EbookFormat | null {
	const lower = filename.toLowerCase();
	if (lower.endsWith(".kepub.epub")) return "kepub";
	if (lower.endsWith(".fb2.zip")) return "fb2";
	if (lower.endsWith(".kepub")) return "kepub";
	if (lower.endsWith(".epub")) return "epub";
	if (lower.endsWith(".azw3")) return "azw3";
	if (lower.endsWith(".mobi")) return "mobi";
	if (lower.endsWith(".azw")) return "azw";
	if (lower.endsWith(".fb2")) return "fb2";
	if (lower.endsWith(".cbz")) return "cbz";
	if (lower.endsWith(".cbr")) return "cbr";
	if (lower.endsWith(".cb7")) return "cb7";
	if (lower.endsWith(".pdf")) return "pdf";
	return null;
}

export function isEpubFamilyFormat(
	format: EbookFormat,
): format is Extract<EbookFormat, "epub" | "kepub"> {
	return format === "epub" || format === "kepub";
}

export function ebookMediaType(format: EbookFormat): string {
	return MEDIA_TYPES[format];
}

export function isSupportedEbookFormat(
	format: EbookFormat,
): format is SupportedEbookFormat {
	return (SUPPORTED_EBOOK_FORMATS as readonly EbookFormat[]).includes(format);
}
