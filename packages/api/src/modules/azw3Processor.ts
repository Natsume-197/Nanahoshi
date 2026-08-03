import fs from "node:fs/promises";
import { acquireCover } from "../lib/cover-store";
import type { BookMetadata } from "../routers/books/metadata/book.metadata.model";
import {
	isUsableEmbeddedUid,
	isValidAsin,
	isValidIsbn10,
	isValidIsbn13,
	normalizeAsin,
	normalizeEmbeddedUid,
	normalizeIsbn,
} from "./identifiers";

const PDB_HEADER_SIZE = 78;
const MOBI_HEADER_OFFSET = 16;
const KF8_VERSION = 8;
const NULL_INDEX = 0xffffffff;
const MAX_SERIES_RESOURCE_BYTES = 1024 * 1024;

const STRING_EXTH_RECORDS = new Set([
	100, 101, 103, 104, 105, 106, 108, 109, 110, 112, 113, 122, 126, 127, 128,
	129, 132, 503, 504, 524, 527,
]);
const UINT_EXTH_RECORDS = new Set([121, 125, 201, 202, 203]);

type RawExthValue = string | number | Buffer;

export type Azw3Metadata = {
	title: string;
	authors: string[];
	publisher: string | null;
	description: string | null;
	publishedDate: string | null;
	languageCode: string | null;
	isbn10: string | null;
	isbn13: string | null;
	asin: string | null;
	embeddedUid: string | null;
	subjects: string[];
	series: { name: string; position: number | null } | null;
};

export type ParsedAzw3 = {
	metadata: Azw3Metadata;
	cover: { bytes: Buffer; extension: string } | null;
	/** Every EXTH value, retained so generated/vendor metadata is not discarded. */
	rawExth: Record<number, RawExthValue[]>;
};

function assertRange(
	buffer: Buffer,
	offset: number,
	length: number,
	label: string,
) {
	if (offset < 0 || length < 0 || offset + length > buffer.length) {
		throw new Error(`Invalid AZW3: ${label} is outside the file`);
	}
}

function readU16(buffer: Buffer, offset: number, label: string): number {
	assertRange(buffer, offset, 2, label);
	return buffer.readUInt16BE(offset);
}

function readU32(buffer: Buffer, offset: number, label: string): number {
	assertRange(buffer, offset, 4, label);
	return buffer.readUInt32BE(offset);
}

function decode(buffer: Buffer, encoding: number): string {
	const decoder = new TextDecoder(
		encoding === 65001 ? "utf-8" : "windows-1252",
	);
	return decoder.decode(buffer).replaceAll("\0", "").trim();
}

function recordOffsets(buffer: Buffer): number[] {
	assertRange(buffer, 0, PDB_HEADER_SIZE, "PalmDB header");
	if (buffer.subarray(60, 68).toString("ascii") !== "BOOKMOBI") {
		throw new Error("Invalid AZW3: PalmDB type is not BOOKMOBI");
	}
	const count = readU16(buffer, 76, "record count");
	if (count === 0) throw new Error("Invalid AZW3: no PalmDB records");
	assertRange(buffer, PDB_HEADER_SIZE, count * 8, "record directory");
	const offsets = Array.from({ length: count }, (_, index) =>
		readU32(buffer, PDB_HEADER_SIZE + index * 8, `record ${index} offset`),
	);
	let previous = PDB_HEADER_SIZE + count * 8;
	for (const [index, offset] of offsets.entries()) {
		if (offset < previous || offset >= buffer.length) {
			throw new Error(`Invalid AZW3: record ${index} offset is invalid`);
		}
		previous = offset;
	}
	return offsets;
}

function recordAt(
	buffer: Buffer,
	offsets: number[],
	index: number,
): Buffer | null {
	const start = offsets[index];
	if (start === undefined) return null;
	const end = offsets[index + 1] ?? buffer.length;
	return buffer.subarray(start, end);
}

function parseExth(
	record0: Buffer,
	mobiLength: number,
	encoding: number,
): Record<number, RawExthValue[]> {
	const exthOffset = MOBI_HEADER_OFFSET + mobiLength;
	assertRange(record0, exthOffset, 12, "EXTH header");
	if (
		record0.subarray(exthOffset, exthOffset + 4).toString("ascii") !== "EXTH"
	) {
		throw new Error("Invalid AZW3: EXTH metadata header is missing");
	}
	const exthLength = readU32(record0, exthOffset + 4, "EXTH length");
	const count = readU32(record0, exthOffset + 8, "EXTH record count");
	assertRange(record0, exthOffset, exthLength, "EXTH metadata");
	const end = exthOffset + exthLength;
	const raw: Record<number, RawExthValue[]> = {};
	let cursor = exthOffset + 12;
	for (let index = 0; index < count; index++) {
		if (cursor + 8 > end)
			throw new Error("Invalid AZW3: truncated EXTH record");
		const type = readU32(record0, cursor, "EXTH type");
		const length = readU32(record0, cursor + 4, "EXTH record length");
		if (length < 8 || cursor + length > end) {
			throw new Error("Invalid AZW3: malformed EXTH record length");
		}
		const payload = record0.subarray(cursor + 8, cursor + length);
		let value: RawExthValue;
		if (UINT_EXTH_RECORDS.has(type) && payload.length >= 4) {
			value = payload.readUInt32BE(0);
		} else if (STRING_EXTH_RECORDS.has(type)) {
			value = decode(payload, encoding);
		} else {
			value = Buffer.from(payload);
		}
		raw[type] ??= [];
		raw[type].push(value);
		cursor += length;
	}
	return raw;
}

function strings(raw: Record<number, RawExthValue[]>, type: number): string[] {
	return (raw[type] ?? [])
		.filter((value): value is string => typeof value === "string")
		.map((value) => value.trim())
		.filter(Boolean);
}

function firstString(
	raw: Record<number, RawExthValue[]>,
	type: number,
): string | null {
	return strings(raw, type)[0] ?? null;
}

function firstNumber(
	raw: Record<number, RawExthValue[]>,
	type: number,
): number | null {
	const value = (raw[type] ?? []).find(
		(candidate): candidate is number => typeof candidate === "number",
	);
	return value ?? null;
}

function normalizeLanguage(value: string | null): string | null {
	const subtags = value?.trim().split(/[-_]/).filter(Boolean) ?? [];
	const primary = subtags[0]?.toLowerCase();
	if (!primary || !/^[a-z]{2,8}$/.test(primary)) return null;
	const normalized = [primary, ...subtags.slice(1)].join("-");
	return normalized.length <= 8 ? normalized : primary;
}

function mobiHeaderLanguage(code: number): string | null {
	const primaryLanguage = code & 0xff;
	return (
		{
			4: "zh",
			7: "de",
			9: "en",
			10: "es",
			12: "fr",
			16: "it",
			17: "ja",
			18: "ko",
			22: "pt",
			25: "ru",
		}[primaryLanguage] ?? null
	);
}

function identifiers(raw: Record<number, RawExthValue[]>) {
	let isbn10: string | null = null;
	let isbn13: string | null = null;
	let asin: string | null = null;
	let embeddedUid: string | null = null;
	for (const candidate of [...strings(raw, 104), ...strings(raw, 112)]) {
		const value = candidate.replace(/^urn:isbn:/i, "");
		if (!isbn13 && isValidIsbn13(value)) isbn13 = normalizeIsbn(value);
		else if (!isbn10 && isValidIsbn10(value)) isbn10 = normalizeIsbn(value);
	}
	for (const candidate of [...strings(raw, 113), ...strings(raw, 504)]) {
		if (isValidAsin(candidate)) {
			asin = normalizeAsin(candidate);
			break;
		}
	}
	for (const source of strings(raw, 112)) {
		const candidate = source.replace(/^calibre:/i, "");
		if (isUsableEmbeddedUid(candidate)) {
			embeddedUid = normalizeEmbeddedUid(candidate);
			break;
		}
	}
	return { isbn10, isbn13, asin, embeddedUid };
}

function imageExtension(bytes: Buffer): string | null {
	if (
		bytes
			.subarray(0, 8)
			.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]))
	)
		return ".png";
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return ".jpg";
	if (
		bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
		bytes.subarray(0, 6).toString("ascii") === "GIF89a"
	)
		return ".gif";
	if (
		bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
		bytes.subarray(8, 12).toString("ascii") === "WEBP"
	)
		return ".webp";
	return null;
}

function embeddedSeries(
	buffer: Buffer,
	offsets: number[],
): Azw3Metadata["series"] {
	// Series is not standard EXTH metadata. Some producers retain Calibre's OPF
	// declaration in a bounded, uncompressed resource; use it without conversion.
	const metas: string[] = [];
	for (let index = 0; index < offsets.length; index++) {
		const record = recordAt(buffer, offsets, index);
		if (!record || record.length > MAX_SERIES_RESOURCE_BYTES) continue;
		if (record.indexOf("calibre:series") < 0) continue;
		metas.push(...(record.toString("utf8").match(/<meta\b[^>]*>/giu) ?? []));
	}
	const values = new Map<string, string>();
	for (const tag of metas) {
		const attrs: Record<string, string> = {};
		for (const match of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/gu)) {
			const name = match[1];
			const value = match[2];
			if (name && value !== undefined) attrs[name.toLowerCase()] = value;
		}
		if (attrs.name && attrs.content) {
			values.set(attrs.name.toLowerCase(), attrs.content);
		}
	}
	const name = values.get("calibre:series")?.trim();
	if (!name) return null;
	const rawPosition = values.get("calibre:series_index");
	const position = rawPosition ? Number(rawPosition) : Number.NaN;
	return { name, position: Number.isFinite(position) ? position : null };
}

/** Parses metadata/resources directly from a native KF8 PalmDB container. */
export function parseAzw3(buffer: Buffer): ParsedAzw3 {
	const offsets = recordOffsets(buffer);
	const record0 = recordAt(buffer, offsets, 0);
	if (!record0) throw new Error("Invalid AZW3: metadata record is missing");
	assertRange(record0, 0, 40, "MOBI header");
	if (record0.subarray(16, 20).toString("ascii") !== "MOBI") {
		throw new Error("Invalid AZW3: MOBI header is missing");
	}
	const mobiLength = readU32(record0, 20, "MOBI header length");
	const encoding = readU32(record0, 28, "text encoding");
	const version = readU32(record0, 36, "MOBI version");
	if (version < KF8_VERSION) {
		throw new Error("Invalid AZW3: not a native AZW3/KF8 file");
	}
	assertRange(record0, MOBI_HEADER_OFFSET, mobiLength, "MOBI header");
	const exthFlags = readU32(record0, 128, "EXTH flags");
	if ((exthFlags & 0x40) === 0) {
		throw new Error("Invalid AZW3: EXTH metadata is missing");
	}
	const rawExth = parseExth(record0, mobiLength, encoding);
	const headerLanguage = mobiHeaderLanguage(
		readU32(record0, 92, "MOBI language"),
	);
	const titleOffset = readU32(record0, 84, "title offset");
	const titleLength = readU32(record0, 88, "title length");
	const fallbackTitle =
		titleLength > 0 && titleOffset + titleLength <= record0.length
			? decode(
					record0.subarray(titleOffset, titleOffset + titleLength),
					encoding,
				)
			: "";
	const subjects = strings(rawExth, 105)
		.flatMap((subject) => subject.split(";"))
		.map((subject) => subject.trim())
		.filter(
			(subject, index, all) =>
				subject.length > 0 && all.indexOf(subject) === index,
		);
	const ids = identifiers(rawExth);

	const firstImageIndex = readU32(record0, 108, "first image index");
	const coverOffset = firstNumber(rawExth, 201);
	const coverRecord =
		coverOffset !== null && firstImageIndex !== NULL_INDEX
			? recordAt(buffer, offsets, firstImageIndex + coverOffset)
			: null;
	const coverExtension = coverRecord ? imageExtension(coverRecord) : null;
	const cover =
		coverRecord && coverExtension
			? {
					bytes: Buffer.from(coverRecord),
					extension: coverExtension,
				}
			: null;

	return {
		metadata: {
			title: firstString(rawExth, 503) ?? fallbackTitle,
			authors: strings(rawExth, 100),
			publisher: firstString(rawExth, 101),
			description: firstString(rawExth, 103),
			publishedDate: firstString(rawExth, 106),
			languageCode:
				normalizeLanguage(firstString(rawExth, 524)) ?? headerLanguage,
			...ids,
			subjects,
			series: embeddedSeries(buffer, offsets),
		},
		cover,
		rawExth,
	};
}

/** Rejects extension-only impostors before the ingestion worker creates a book. */
export async function assertNativeAzw3File(filePath: string): Promise<void> {
	parseAzw3(await fs.readFile(filePath));
}

export async function processAzw3(
	filePath: string,
	uuid: string,
): Promise<Partial<BookMetadata>> {
	const parsed = parseAzw3(await fs.readFile(filePath));
	const { metadata } = parsed;
	const cover = parsed.cover
		? await acquireCover(parsed.cover.bytes, uuid, parsed.cover.extension)
		: null;
	return {
		title: metadata.title || undefined,
		description: metadata.description || undefined,
		authors: metadata.authors.map((name) => ({ name, role: null })),
		publishedDate: metadata.publishedDate || undefined,
		languageCode: metadata.languageCode || undefined,
		pageCount: null,
		isbn10: metadata.isbn10,
		isbn13: metadata.isbn13,
		asin: metadata.asin,
		embeddedUid: metadata.embeddedUid,
		cover: cover || undefined,
		contentForm:
			firstString(parsed.rawExth, 122)?.toLowerCase() === "true"
				? "images"
				: "text",
		publisher: metadata.publisher ? { name: metadata.publisher } : undefined,
		series: metadata.series || undefined,
		genres: metadata.subjects,
	};
}
