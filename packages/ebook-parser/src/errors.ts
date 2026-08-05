export class EbookParserError extends Error {}

export class UnsupportedFormatError extends EbookParserError {}

export class CorruptEbookError extends EbookParserError {}

export class EncryptedEbookError extends EbookParserError {}
