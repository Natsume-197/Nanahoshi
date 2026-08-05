import type { EbookDocument, EbookFormat, OpenEbookOptions } from "./ebook";
import { UnsupportedFormatError } from "./errors";
import {
	ebookFormatFromFilename,
	isEpubFamilyFormat,
	isSupportedEbookFormat,
} from "./formats";
import { normalizeOpenError } from "./normalize-error";

export type * from "./ebook";
export * from "./errors";
export * from "./formats";

export async function openEbook(
	input: Blob | ArrayBuffer | Uint8Array,
	options: OpenEbookOptions = {},
): Promise<EbookDocument> {
	const format = options.formatHint ?? formatFromOptions(options);
	if (!format || !isSupportedEbookFormat(format)) {
		throw new UnsupportedFormatError(
			format
				? `Ebook format is not implemented yet: ${format}`
				: "Could not detect ebook format",
		);
	}

	try {
		if (isEpubFamilyFormat(format)) {
			const { openEpubDocument } = await import("./epub/browser");
			return await openEpubDocument(toBlob(input), format);
		}
		if (format === "fb2") {
			const { openFb2Document } = await import("./fb2/browser");
			return await openFb2Document(toBlob(input));
		}
		if (format === "cbz" || format === "cbr" || format === "cb7") {
			const { openComicDocument } = await import("./comic/browser");
			return await openComicDocument(toBlob(input), format);
		}

		const { openMobiDocument } = await import("./mobi/document");
		return openMobiDocument(await toBytes(input), format);
	} catch (error) {
		throw normalizeOpenError(error, format);
	}
}

function formatFromOptions(options: OpenEbookOptions): EbookFormat | null {
	return options.filename ? ebookFormatFromFilename(options.filename) : null;
}

function toBlob(input: Blob | ArrayBuffer | Uint8Array): Blob {
	if (input instanceof Blob) return input;
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	return new Blob([Uint8Array.from(bytes)]);
}

async function toBytes(
	input: Blob | ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
	if (input instanceof Uint8Array) return input;
	if (input instanceof ArrayBuffer) return new Uint8Array(input);
	return new Uint8Array(await input.arrayBuffer());
}
