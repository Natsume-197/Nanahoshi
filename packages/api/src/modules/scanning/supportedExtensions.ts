export type LibraryMediaType = "ebook" | "audiobook";

// Shared by the upload route (server-side enforcement) and the upload modal
// (client-side pre-validation) so the two limits can't drift apart.
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export const EBOOK_EXTENSIONS = ["epub", "azw3"] as const;
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
	const dot = filename.lastIndexOf(".");
	if (dot < 0) return false;
	const ext = filename.slice(dot + 1).toLowerCase();
	return getExtensionsForMediaType(mediaType).includes(ext);
}

/** The browser reader intentionally supports EPUB only; other ebooks download. */
export function isReaderSupportedEbook(filename: string): boolean {
	return filename.toLowerCase().endsWith(".epub");
}

export function getEbookMediaType(filename: string): string {
	return filename.toLowerCase().endsWith(".azw3")
		? "application/vnd.amazon.ebook"
		: "application/epub+zip";
}
