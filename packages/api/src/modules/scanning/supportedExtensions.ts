import {
	ebookFormatFromFilename,
	ebookMediaType,
	isSupportedEbookFormat,
	type SupportedEbookFormat,
} from "@nanahoshi-v2/ebook-parser/formats";

export type LibraryMediaType = "ebook" | "audiobook";

// Shared by the upload route (server-side enforcement) and the upload modal
// (client-side pre-validation) so the two limits can't drift apart.
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const MAX_UPLOAD_BATCH_BYTES = MAX_UPLOAD_BYTES;
// Bun applies this limit to the complete multipart request, not just its files.
// Leave bounded room for field names, boundaries and other multipart headers.
export const MAX_UPLOAD_REQUEST_BYTES =
	MAX_UPLOAD_BATCH_BYTES + 8 * 1024 * 1024;

export function isUploadBatchTooLarge(
	files: readonly Pick<File, "size">[],
): boolean {
	return (
		files.reduce((total, file) => total + file.size, 0) > MAX_UPLOAD_BATCH_BYTES
	);
}

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
export const KEPUB_MEDIA_TYPE = ebookMediaType("kepub");
export const AZW_MEDIA_TYPE = ebookMediaType("azw");
export const AZW3_MEDIA_TYPE = ebookMediaType("azw3");
export const MOBI_MEDIA_TYPE = ebookMediaType("mobi");
export const FB2_MEDIA_TYPE = ebookMediaType("fb2");
export const CBZ_MEDIA_TYPE = ebookMediaType("cbz");
export const CBR_MEDIA_TYPE = ebookMediaType("cbr");
export const CB7_MEDIA_TYPE = ebookMediaType("cb7");

export function isEpubFamilyFilename(filename: string): boolean {
	const format = ebookFormatFromFilename(filename);
	return format === "epub" || format === "kepub";
}

export function isEpubFamilyMediaType(
	mediaType: string | null | undefined,
): boolean {
	return mediaType === EPUB_MEDIA_TYPE;
}

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
