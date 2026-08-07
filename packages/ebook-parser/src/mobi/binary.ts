import { unzlibSync } from "fflate";
import type { MobiMetadata, MobiResource } from "./types";

type StructField = readonly [
	offset: number,
	length: number,
	type: "string" | "uint",
];
type StructDefinition = Record<string, StructField>;

interface PalmDocHeader {
	compression: number;
	numTextRecords: number;
	recordSize: number;
	encryption: number;
}

interface MobiHeader {
	magic: string;
	length: number;
	type: number;
	encoding: number;
	uid: number;
	version: number;
	titleOffset: number;
	titleLength: number;
	localeRegion: number;
	localeLanguage: number;
	resourceStart: number;
	huffcdic: number;
	numHuffcdic: number;
	exthFlag: number;
	trailingFlags: number;
	indx: number;
	title: string;
	language: string;
}

export interface Kf8Header {
	resourceStart: number;
	fdst: number;
	numFdst: number;
	frag: number;
	skel: number;
	guide: number;
}

type ExthValue = string | number | (string | number)[];
type Exth = Record<string, ExthValue | undefined>;

const pdbHeader = {
	name: [0, 32, "string"],
	type: [60, 4, "string"],
	creator: [64, 4, "string"],
	numRecords: [76, 2, "uint"],
} as const;

const palmDocHeader = {
	compression: [0, 2, "uint"],
	numTextRecords: [8, 2, "uint"],
	recordSize: [10, 2, "uint"],
	encryption: [12, 2, "uint"],
} as const;

const mobiHeader = {
	magic: [16, 4, "string"],
	length: [20, 4, "uint"],
	type: [24, 4, "uint"],
	encoding: [28, 4, "uint"],
	uid: [32, 4, "uint"],
	version: [36, 4, "uint"],
	titleOffset: [84, 4, "uint"],
	titleLength: [88, 4, "uint"],
	localeRegion: [94, 1, "uint"],
	localeLanguage: [95, 1, "uint"],
	resourceStart: [108, 4, "uint"],
	huffcdic: [112, 4, "uint"],
	numHuffcdic: [116, 4, "uint"],
	exthFlag: [128, 4, "uint"],
	trailingFlags: [240, 4, "uint"],
	indx: [244, 4, "uint"],
} as const;

const kf8Header = {
	resourceStart: [108, 4, "uint"],
	fdst: [192, 4, "uint"],
	numFdst: [196, 4, "uint"],
	frag: [248, 4, "uint"],
	skel: [252, 4, "uint"],
	guide: [260, 4, "uint"],
} as const;

const exthRecordType: Record<
	number,
	readonly [name: string, type: "string" | "uint", many: boolean]
> = {
	100: ["creator", "string", true],
	101: ["publisher", "string", false],
	103: ["description", "string", false],
	104: ["isbn", "string", false],
	105: ["subject", "string", true],
	106: ["date", "string", false],
	108: ["contributor", "string", true],
	109: ["rights", "string", false],
	112: ["source", "string", true],
	113: ["asin", "string", false],
	121: ["boundary", "uint", false],
	125: ["numResources", "uint", false],
	129: ["kf8CoverUri", "string", false],
	201: ["coverOffset", "uint", false],
	202: ["thumbnailOffset", "uint", false],
	503: ["title", "string", false],
	524: ["language", "string", true],
};

const mobiLanguages: Record<number, readonly (string | null)[]> = {
	1: ["ar"],
	2: ["bg"],
	3: ["ca"],
	4: ["zh", "zh-TW", "zh-CN", "zh-HK", "zh-SG"],
	5: ["cs"],
	6: ["da"],
	7: ["de", "de-DE", "de-CH", "de-AT"],
	8: ["el"],
	9: ["en", "en-US", "en-GB", "en-AU", "en-CA", "en-NZ", "en-IE", "en-ZA"],
	10: [
		"es",
		"es-ES",
		"es-MX",
		null,
		"es-GT",
		"es-CR",
		"es-PA",
		"es-DO",
		"es-VE",
		"es-CO",
		"es-PE",
		"es-AR",
		"es-EC",
		"es-CL",
		"es-UY",
	],
	11: ["fi"],
	12: ["fr", "fr-FR", "fr-BE", "fr-CA", "fr-CH"],
	13: ["he"],
	14: ["hu"],
	15: ["is"],
	16: ["it", "it-IT", "it-CH"],
	17: ["ja"],
	18: ["ko"],
	19: ["nl", "nl-NL", "nl-BE"],
	20: ["no", "nb", "nn"],
	21: ["pl"],
	22: ["pt", "pt-BR", "pt-PT"],
	24: ["ro"],
	25: ["ru"],
	26: ["hr", null, "sr"],
	27: ["sk"],
	29: ["sv", "sv-SE", "sv-FI"],
	30: ["th"],
	31: ["tr"],
	32: ["ur"],
	33: ["id"],
	34: ["uk"],
	35: ["be"],
	36: ["sl"],
	37: ["et"],
	38: ["lv"],
	39: ["lt"],
	41: ["fa"],
	42: ["vi"],
	43: ["hy"],
	44: ["az"],
	45: ["eu"],
	47: ["mk"],
	54: ["af"],
	55: ["ka"],
	57: ["hi"],
	58: ["mt"],
	62: ["ms"],
	63: ["kk"],
	65: ["sw"],
	68: ["tt"],
	69: ["bn"],
	70: ["pa"],
	71: ["gu"],
	72: ["or"],
	73: ["ta"],
	74: ["te"],
	75: ["kn"],
	76: ["ml"],
	77: ["as"],
	78: ["mr"],
	82: ["cy", "cy-GB"],
	83: ["gl", "gl-ES"],
	97: ["ne"],
	98: ["fy"],
};

const textDecoder = new TextDecoder();

/** EXTH's "this pointer is unset" sentinel, and the ceiling on every index. */
const NO_RESOURCE = 0xffff_ffff;

/**
 * How far into the resource section to look for a declared-but-unlocatable
 * cover. KF8 writes its images first, so the cover is within the first few
 * records; scanning further would start returning interior illustrations.
 */
const COVER_SCAN_LIMIT = 8;

/** `kindle:embed:NNNN` → resource index. NNNN is base-32 and 1-based. */
function kf8CoverIndex(uri: string): number {
	const id = uri.match(/^kindle:embed:([0-9a-v]+)/i)?.[1];
	if (!id) return NO_RESOURCE;
	const index = Number.parseInt(id, 32) - 1;
	return Number.isFinite(index) && index >= 0 ? index : NO_RESOURCE;
}

export class MobiContainer {
	readonly palmDoc: PalmDocHeader;
	readonly mobi: MobiHeader;
	readonly kf8?: Kf8Header;
	readonly isKf8: boolean;
	private readonly bytes: Uint8Array;
	private readonly recordOffsets: number[];
	private readonly decoder: TextDecoder;
	private readonly exth: Exth;
	private readonly startRecord: number;
	private readonly resourceRecord: number;
	private readonly decompress: (data: Uint8Array) => Uint8Array;
	private readonly stripTrailing: (data: Uint8Array) => Uint8Array;

	constructor(input: ArrayBuffer | Uint8Array) {
		this.bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
		if (this.bytes.byteLength < 86)
			throw new Error("File is too small to be a Palm database");
		const pdb = readStruct(this.bytes.subarray(0, 78), pdbHeader);
		const numRecords = numberField(pdb.numRecords, "PDB record count");
		this.recordOffsets = Array.from({ length: numRecords }, (_, index) =>
			readUint(this.bytes, 78 + index * 8, 4),
		);
		if (
			!this.recordOffsets.length ||
			this.recordOffsets.some((offset) => offset >= this.bytes.length)
		) {
			throw new Error("Invalid Palm database record table");
		}

		let startRecord = 0;
		let parsed = this.parseHeader(startRecord);
		if (parsed.mobi.version < 8) {
			const boundary = numberValue(parsed.exth.boundary, 0xffff_ffff);
			if (boundary < 0xffff_ffff && boundary < this.recordOffsets.length) {
				const candidate = this.parseHeader(boundary);
				if (candidate.mobi.version >= 8) {
					startRecord = boundary;
					parsed = candidate;
				}
			}
		}

		this.startRecord = startRecord;
		this.palmDoc = parsed.palmDoc;
		this.mobi = parsed.mobi;
		this.kf8 = parsed.kf8;
		this.isKf8 = parsed.mobi.version >= 8;
		this.exth = parsed.exth;
		// MOBI's first-image index is an absolute PalmDB record number, including
		// in joint MOBI7+KF8 files whose text/index records are boundary-relative.
		this.resourceRecord = parsed.mobi.resourceStart;
		this.decoder = decoderFor(parsed.mobi.encoding);
		this.stripTrailing = trailingEntryStripper(parsed.mobi.trailingFlags);

		if (parsed.palmDoc.encryption !== 0) {
			throw new Error("Encrypted MOBI/AZW files are not supported");
		}
		if (parsed.palmDoc.compression === 1) this.decompress = (data) => data;
		else if (parsed.palmDoc.compression === 2)
			this.decompress = decompressPalmDoc;
		else if (parsed.palmDoc.compression === 17480) {
			this.decompress = createHuffCdicDecompressor(parsed.mobi, (index) =>
				this.loadRecord(index),
			);
		} else
			throw new Error(
				`Unsupported MOBI compression: ${parsed.palmDoc.compression}`,
			);
	}

	decode(data: Uint8Array): string {
		return this.decoder.decode(data);
	}

	loadRecord(index: number): Uint8Array {
		return this.loadPdbRecord(this.startRecord + index);
	}

	loadTextRecord(index: number): Uint8Array {
		return this.decompress(this.stripTrailing(this.loadRecord(index + 1)));
	}

	loadResource(index: number): MobiResource {
		const record = this.loadPdbRecord(this.resourceRecord + index);
		const magic = textDecoder.decode(record.subarray(0, 4));
		let data = record;
		if (magic === "FONT") data = decodeFont(record);
		else if (magic === "VIDE" || magic === "AUDI") data = record.subarray(12);
		return { data, mediaType: detectMediaType(data) };
	}

	getMetadata(): MobiMetadata {
		return {
			identifier: String(this.mobi.uid),
			title: stringValue(this.exth.title) || this.mobi.title,
			authors: stringArray(this.exth.creator).map(unescapeHtml),
			publisher: stringValue(this.exth.publisher),
			language: stringArray(this.exth.language)[0] || this.mobi.language,
			published: stringValue(this.exth.date),
			description: stringValue(this.exth.description),
			subjects: stringArray(this.exth.subject).map(unescapeHtml),
			rights: stringValue(this.exth.rights),
			contributors: stringArray(this.exth.contributor).map(unescapeHtml),
			asin: stringValue(this.exth.asin),
			isbn: stringValue(this.exth.isbn),
		};
	}

	/**
	 * 201/202 are the MOBI6 cover tags, and a KF8 file routinely ships neither:
	 * it points at its cover with EXTH 129 (`kindle:embed:NNNN`) instead. Reading
	 * only 201/202 reported "no cover" for 449 of the 459 coverless AZW3 in the
	 * library that prompted this — every one of them declared 129.
	 *
	 * The declared index is checked rather than trusted: across the MOBI7/KF8
	 * boundary it can land on a structural record (RESC, FDST) instead of art. A
	 * file that declares a cover therefore falls back to the first image in its
	 * resource section — the KF8 convention — rather than reporting none. A file
	 * that declares nothing still returns undefined; never invent a cover.
	 */
	getCover(): MobiResource | undefined {
		const declared = [
			numberValue(this.exth.coverOffset, NO_RESOURCE),
			numberValue(this.exth.thumbnailOffset, NO_RESOURCE),
			kf8CoverIndex(stringValue(this.exth.kf8CoverUri)),
		].filter((index) => index < NO_RESOURCE && index >= 0);

		for (const index of declared) {
			const resource = this.loadImageResource(index);
			if (resource) return resource;
		}
		if (!declared.length) return undefined;

		for (let index = 0; index < COVER_SCAN_LIMIT; index++) {
			const resource = this.loadImageResource(index);
			if (resource) return resource;
		}
		return undefined;
	}

	/** A resource that is really an image, or nothing — out-of-range indices and
	 * structural records both read as "not the cover". */
	private loadImageResource(index: number): MobiResource | undefined {
		try {
			const resource = this.loadResource(index);
			return resource.mediaType.startsWith("image/") ? resource : undefined;
		} catch {
			return undefined;
		}
	}

	private loadPdbRecord(index: number): Uint8Array {
		const start = this.recordOffsets[index];
		if (start === undefined)
			throw new RangeError(`MOBI record ${index} is out of bounds`);
		const end = this.recordOffsets[index + 1] ?? this.bytes.length;
		if (end < start || end > this.bytes.length)
			throw new Error(`Invalid MOBI record ${index}`);
		return this.bytes.subarray(start, end);
	}

	private parseHeader(recordIndex: number) {
		const record = this.loadPdbRecord(recordIndex);
		const palmDoc = readStruct(
			record.subarray(0, 16),
			palmDocHeader,
		) as unknown as PalmDocHeader;
		const rawMobi = readStruct(record, mobiHeader);
		if (rawMobi.magic !== "MOBI") throw new Error("Missing MOBI header");
		const encoding = numberField(rawMobi.encoding, "MOBI encoding");
		const titleOffset = numberField(rawMobi.titleOffset, "title offset");
		const titleLength = numberField(rawMobi.titleLength, "title length");
		const localeLanguage = numberField(rawMobi.localeLanguage, "language");
		const localeRegion = numberField(rawMobi.localeRegion, "region");
		const languages = mobiLanguages[localeLanguage] ?? [];
		const mobi = {
			...rawMobi,
			title: decoderFor(encoding).decode(
				record.subarray(titleOffset, titleOffset + titleLength),
			),
			language: languages[localeRegion >> 2] ?? languages[0] ?? "",
		} as unknown as MobiHeader;
		const parsedKf8 =
			mobi.version >= 8
				? (readStruct(record, kf8Header) as unknown as Kf8Header)
				: undefined;
		const exth =
			mobi.exthFlag & 0x40
				? parseExth(record.subarray(mobi.length + 16), encoding)
				: {};
		return { palmDoc, mobi, kf8: parsedKf8, exth };
	}
}

function readStruct(
	bytes: Uint8Array,
	definition: StructDefinition,
): Record<string, string | number> {
	const result: Record<string, string | number> = {};
	for (const [key, [offset, length, type]] of Object.entries(definition)) {
		if (offset + length > bytes.length) {
			result[key] = type === "string" ? "" : 0xffff_ffff;
			continue;
		}
		result[key] =
			type === "string"
				? textDecoder.decode(bytes.subarray(offset, offset + length))
				: readUint(bytes, offset, length);
	}
	return result;
}

export function readUint(
	bytes: Uint8Array,
	offset: number,
	length: number,
): number {
	if (offset < 0 || offset + length > bytes.length)
		throw new RangeError("Binary read is out of bounds");
	const view = new DataView(bytes.buffer, bytes.byteOffset + offset, length);
	if (length === 4) return view.getUint32(0);
	if (length === 2) return view.getUint16(0);
	return view.getUint8(0);
}

export function readString(
	bytes: Uint8Array,
	offset: number,
	length: number,
): string {
	return textDecoder.decode(bytes.subarray(offset, offset + length));
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
	const output = new Uint8Array(
		parts.reduce((size, part) => size + part.length, 0),
	);
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.length;
	}
	return output;
}

export function readVariableLength(
	bytes: Uint8Array,
	offset = 0,
): { value: number; length: number } {
	let value = 0;
	let length = 0;
	for (const byte of bytes.subarray(offset, offset + 4)) {
		value = (value << 7) | (byte & 0x7f);
		length++;
		if (byte & 0x80) break;
	}
	return { value: value >>> 0, length };
}

export function countSetBits(value: number): number {
	let count = 0;
	for (let current = value >>> 0; current; current >>>= 1) count += current & 1;
	return count;
}

export function countTrailingZeroBits(value: number): number {
	let count = 0;
	for (
		let current = value >>> 0;
		current && (current & 1) === 0;
		current >>>= 1
	)
		count++;
	return count;
}

export function decoderFor(encoding: number): TextDecoder {
	if (encoding === 65001) return new TextDecoder("utf-8");
	if (encoding === 1252) return new TextDecoder("windows-1252");
	throw new Error(`Unsupported MOBI text encoding: ${encoding}`);
}

export function decompressPalmDoc(input: Uint8Array): Uint8Array {
	const output: number[] = [];
	for (let index = 0; index < input.length; index++) {
		const byte = input[index] ?? 0;
		if (byte === 0) output.push(0);
		else if (byte <= 8) {
			const end = Math.min(input.length, index + byte + 1);
			for (const literal of input.subarray(index + 1, end))
				output.push(literal);
			index += byte;
		} else if (byte <= 0x7f) output.push(byte);
		else if (byte <= 0xbf) {
			const next = input[++index];
			if (next === undefined)
				throw new Error("Truncated PalmDOC back-reference");
			const pair = (byte << 8) | next;
			const distance = (pair & 0x3fff) >>> 3;
			const length = (pair & 7) + 3;
			if (!distance || distance > output.length)
				throw new Error("Invalid PalmDOC back-reference");
			for (let copy = 0; copy < length; copy++)
				output.push(output[output.length - distance] ?? 0);
		} else output.push(0x20, byte ^ 0x80);
	}
	return Uint8Array.from(output);
}

function parseExth(bytes: Uint8Array, encoding: number): Exth {
	if (readString(bytes, 0, 4) !== "EXTH")
		throw new Error("Invalid EXTH header");
	const count = readUint(bytes, 8, 4);
	const decoder = decoderFor(encoding);
	const result: Exth = {};
	let offset = 12;
	for (let index = 0; index < count; index++) {
		const type = readUint(bytes, offset, 4);
		const length = readUint(bytes, offset + 4, 4);
		if (length < 8 || offset + length > bytes.length)
			throw new Error("Invalid EXTH record length");
		const definition = exthRecordType[type];
		if (definition) {
			const [name, valueType, many] = definition;
			const data = bytes.subarray(offset + 8, offset + length);
			const value: string | number =
				valueType === "uint"
					? readUint(data, 0, data.length)
					: decoder.decode(data);
			if (many) {
				const existing = result[name];
				result[name] = Array.isArray(existing)
					? [...existing, value]
					: ([value] as string[] | number[]);
			} else result[name] = value;
		}
		offset += length;
	}
	return result;
}

function trailingEntryStripper(
	flags: number,
): (data: Uint8Array) => Uint8Array {
	const hasMultibyte = flags & 1;
	const trailingEntries = countSetBits(flags >>> 1);
	return (input) => {
		let data = input;
		for (let index = 0; index < trailingEntries; index++) {
			const length = variableLengthFromEnd(data);
			if (length <= 0 || length > data.length)
				throw new Error("Invalid trailing MOBI entry");
			data = data.subarray(0, data.length - length);
		}
		if (hasMultibyte && data.length) {
			const length = ((data[data.length - 1] ?? 0) & 3) + 1;
			data = data.subarray(0, Math.max(0, data.length - length));
		}
		return data;
	};
}

function variableLengthFromEnd(bytes: Uint8Array): number {
	let value = 0;
	for (const byte of bytes.subarray(Math.max(0, bytes.length - 4))) {
		if (byte & 0x80) value = 0;
		value = (value << 7) | (byte & 0x7f);
	}
	return value;
}

function createHuffCdicDecompressor(
	mobi: MobiHeader,
	loadRecord: (index: number) => Uint8Array,
) {
	const huff = loadRecord(mobi.huffcdic);
	if (readString(huff, 0, 4) !== "HUFF") throw new Error("Invalid HUFF record");
	const offset1 = readUint(huff, 8, 4);
	const offset2 = readUint(huff, 12, 4);
	const table1 = Array.from({ length: 256 }, (_, index) =>
		readUint(huff, offset1 + index * 4, 4),
	).map(
		(value) =>
			[value & 0x80, value & 0x1f, value >>> 8] as [number, number, number],
	);
	const table2: [number, number][] = [[0, 0]];
	for (let index = 0; index < 32; index++) {
		table2.push([
			readUint(huff, offset2 + index * 8, 4),
			readUint(huff, offset2 + index * 8 + 4, 4),
		]);
	}
	const dictionary: [Uint8Array, boolean][] = [];
	for (let recordIndex = 1; recordIndex < mobi.numHuffcdic; recordIndex++) {
		const record = loadRecord(mobi.huffcdic + recordIndex);
		if (readString(record, 0, 4) !== "CDIC")
			throw new Error("Invalid CDIC record");
		const length = readUint(record, 4, 4);
		const numEntries = readUint(record, 8, 4);
		const codeLength = readUint(record, 12, 4);
		const count = Math.min(2 ** codeLength, numEntries - dictionary.length);
		const data = record.subarray(length);
		for (let index = 0; index < count; index++) {
			const offset = readUint(data, index * 2, 2);
			const value = readUint(data, offset, 2);
			dictionary.push([
				data.subarray(offset + 2, offset + 2 + (value & 0x7fff)),
				Boolean(value & 0x8000),
			]);
		}
	}

	const decompress = (input: Uint8Array): Uint8Array => {
		const output: Uint8Array[] = [];
		const bitLength = input.byteLength * 8;
		for (let bit = 0; bit < bitLength; ) {
			const bits = Number(read32Bits(input, bit));
			let [found, codeLength, value] = table1[bits >>> 24] ?? [0, 0, 0];
			if (!found) {
				while (
					codeLength < table2.length &&
					bits >>> (32 - codeLength) < (table2[codeLength]?.[0] ?? 0)
				)
					codeLength++;
				value = table2[codeLength]?.[1] ?? 0;
			}
			bit += codeLength;
			if (!codeLength || bit > bitLength) break;
			const code = value - (bits >>> (32 - codeLength));
			const entry = dictionary[code];
			if (!entry) throw new Error("Invalid HUFF/CDIC dictionary reference");
			let [result, ready] = entry;
			if (!ready) {
				result = decompress(result);
				dictionary[code] = [result, true];
			}
			output.push(result);
		}
		return concatBytes(output);
	};
	return decompress;
}

function read32Bits(bytes: Uint8Array, from: number): bigint {
	const startByte = from >> 3;
	const end = from + 32;
	const endByte = end >> 3;
	let bits = 0n;
	for (let index = startByte; index <= endByte; index++)
		bits = (bits << 8n) | BigInt(bytes[index] ?? 0);
	return (bits >> (8n - BigInt(end & 7))) & 0xffff_ffffn;
}

function decodeFont(record: Uint8Array): Uint8Array {
	const flags = readUint(record, 8, 4);
	const dataStart = readUint(record, 12, 4);
	const keyLength = readUint(record, 16, 4);
	const keyStart = readUint(record, 20, 4);
	let data = record.slice(dataStart);
	if (flags & 2) {
		const key = record.subarray(keyStart, keyStart + keyLength);
		if (!key.length) throw new Error("Invalid encrypted FONT resource");
		const length = Math.min(keyLength === 16 ? 1024 : 1040, data.length);
		for (let index = 0; index < length; index++)
			data[index] = (data[index] ?? 0) ^ (key[index % key.length] ?? 0);
	}
	if (flags & 1) data = unzlibSync(data);
	return data;
}

function detectMediaType(bytes: Uint8Array): string {
	const signatures: readonly [string, string][] = [
		["ffd8ff", "image/jpeg"],
		["89504e47", "image/png"],
		["47494638", "image/gif"],
		["424d", "image/bmp"],
		["3c737667", "image/svg+xml"],
		["00000018", "video/mp4"],
		["00000020", "video/mp4"],
		["1a45dfa3", "video/webm"],
		["494433", "audio/mpeg"],
		["52494646", "audio/wav"],
		["4f676753", "audio/ogg"],
		["00010000", "font/ttf"],
		["74727565", "font/ttf"],
		["4f54544f", "font/otf"],
		["774f4646", "font/woff"],
		["774f4632", "font/woff2"],
	];
	const hex = [...bytes.subarray(0, 12)]
		.map((value) => value.toString(16).padStart(2, "0"))
		.join("");
	// WebP is a RIFF container, so it has to be told apart from WAV by its form
	// type — otherwise a WebP cover reads as audio and is discarded as art.
	if (hex.startsWith("52494646") && hex.slice(16, 24) === "57454250") {
		return "image/webp";
	}
	return (
		signatures.find(([signature]) => hex.startsWith(signature))?.[1] ??
		"application/octet-stream"
	);
}

function unescapeHtml(value: string): string {
	return value.replace(
		/&(#x[\dA-Fa-f]+|#\d+|lt|gt|amp|quot|apos);/g,
		(match, entity: string) => {
			if (entity.startsWith("#x"))
				return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
			if (entity.startsWith("#"))
				return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
			return (
				(
					{ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" } as Record<
						string,
						string
					>
				)[entity] ?? match
			);
		},
	);
}

function numberField(
	value: string | number | undefined,
	label: string,
): number {
	if (typeof value !== "number") throw new Error(`Invalid ${label}`);
	return value;
}

function numberValue(value: ExthValue | undefined, fallback: number): number {
	return typeof value === "number" ? value : fallback;
}

function stringValue(value: ExthValue | undefined): string {
	return typeof value === "string" ? value : "";
}

function stringArray(value: ExthValue | undefined): string[] {
	if (typeof value === "string") return [value];
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}
