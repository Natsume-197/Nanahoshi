import {
	ebookFormatFromFilename,
	ebookMediaType,
	isSupportedEbookFormat,
	type SupportedEbookFormat,
} from "@nanahoshi/ebook-parser/formats";

export type LibraryMediaType = "ebook" | "audiobook";

// Shared by the upload route (server-side enforcement) and the upload modal
// (client-side pre-validation) so the two limits can't drift apart. Each
// request carries one file streamed straight to disk, so this bounds disk use,
// not memory.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
// Bun's transport cap; the route enforces the exact limit and answers with JSON.
export const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;

export const EBOOK_EXTENSIONS = [
	"epub",
	"kepub",
	"kepub.epub",
	"mobi",
	"azw",
	"azw3",
	"fb2",
	"fb2.zip",
	"cbz",
	"cbr",
	"cb7",
	"pdf",
] as const;
export const AUDIOBOOK_EXTENSIONS = [
	"m4b",
	"m4a",
	"mp3",
	"ogg",
	"opus",
	"flac",
	"wma",
] as const;

export function getExtensionsForMediaType(
	mediaType: LibraryMediaType,
): readonly string[] {
	return mediaType === "audiobook" ? AUDIOBOOK_EXTENSIONS : EBOOK_EXTENSIONS;
}

/** True when `filename`'s extension is supported for the given media type. */
export function isSupportedExtension(
	filename: string,
	mediaType: LibraryMediaType,
): boolean {
	if (mediaType === "ebook") {
		const format = ebookFormatFromFilename(filename);
		return format !== null && isSupportedEbookFormat(format);
	}
	const dot = filename.lastIndexOf(".");
	if (dot < 0) return false;
	const ext = filename.slice(dot + 1).toLowerCase();
	return getExtensionsForMediaType(mediaType).includes(ext);
}

export const EPUB_MEDIA_TYPE = ebookMediaType("epub");
export const AZW_MEDIA_TYPE = ebookMediaType("azw");
export const AZW3_MEDIA_TYPE = ebookMediaType("azw3");
export const MOBI_MEDIA_TYPE = ebookMediaType("mobi");
export const FB2_MEDIA_TYPE = ebookMediaType("fb2");

export type EbookSourceFormat = SupportedEbookFormat;

export function ebookSourceFormatForFilename(
	filename: string,
): EbookSourceFormat | null {
	const format = ebookFormatFromFilename(filename);
	return format && isSupportedEbookFormat(format) ? format : null;
}

export function ebookMediaTypeForFilename(filename: string): string {
	const format = ebookFormatFromFilename(filename);
	return format ? ebookMediaType(format) : "application/octet-stream";
}
