import {
	CorruptEbookError,
	EbookParserError,
	EncryptedEbookError,
} from "./errors";

export function normalizeOpenError(error: unknown, format: string): Error {
	if (error instanceof EbookParserError) return error;
	const message = error instanceof Error ? error.message : String(error);
	if (/encrypted|drm/i.test(message)) {
		return new EncryptedEbookError(message);
	}
	return new CorruptEbookError(`Could not open ${format}: ${message}`);
}
