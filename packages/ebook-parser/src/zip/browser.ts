/**
 * Browser ZIP reader shared by archive-based ebook formats. The central directory is read
 * with `Blob.slice`, and entries are inflated with `DecompressionStream`
 * (native) rather than a JS inflate.
 *
 * The payoff is biggest for stored (uncompressed) entries — very common for
 * images, and some publishers store the *whole* book that way. Those become a
 * `Blob.slice` of the original file: a view over bytes we already have, with no
 * decompression and no copy through JS at all.
 *
 * Scope is deliberately the ZIP subset used by our ebook formats, not "every ZIP
 * in the wild": UTF-8 entry names plus stored (0) and deflate (8). ZIP64 is
 * handled because it is a size threshold, not an exotic feature.
 */

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CD_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
const ZIP64_EXTRA_ID = 0x0001;
const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/** The EOCD sits at the end, behind up to 64KB of optional archive comment. */
const EOCD_MAX_SCAN = 22 + U16_MAX;

const textDecoder = new TextDecoder("utf-8");

export class ZipFormatError extends Error {}

interface ZipEntry {
	name: string;
	compressedSize: number;
	uncompressedSize: number;
	method: number;
	localHeaderOffset: number;
}

export interface ZipReader {
	has(name: string): boolean;
	/** Entry names, in central-directory order. */
	names(): string[];
	/** The entry as a Blob. Stored entries are a zero-copy slice of the file. */
	blob(name: string, type: string): Promise<Blob | undefined>;
	/** The entry as bytes. */
	bytes(name: string): Promise<Uint8Array | undefined>;
	/** The entry decoded as UTF-8 text, with any BOM stripped. */
	text(name: string): Promise<string | undefined>;
}

export async function openZip(file: Blob): Promise<ZipReader> {
	const { cdOffset, cdSize } = await findCentralDirectory(file);
	const entries = await readCentralDirectory(file, cdOffset, cdSize);

	const readBlob = async (entry: ZipEntry, type: string): Promise<Blob> => {
		// The central directory's extra field and the local header's can differ
		// in length, so the data offset can only be resolved from the local header.
		const header = new Uint8Array(
			await file
				.slice(entry.localHeaderOffset, entry.localHeaderOffset + 30)
				.arrayBuffer(),
		);
		if (header.length < 30) {
			throw new ZipFormatError(`Truncated local header for ${entry.name}`);
		}
		const view = new DataView(header.buffer, header.byteOffset, 30);
		if (view.getUint32(0, true) !== LFH_SIG) {
			throw new ZipFormatError(`Bad local header for ${entry.name}`);
		}
		const start =
			entry.localHeaderOffset +
			30 +
			view.getUint16(26, true) +
			view.getUint16(28, true);

		const raw = file.slice(start, start + entry.compressedSize, type);
		// Stored: the slice already *is* the entry. No inflate, no copy.
		if (entry.method === METHOD_STORED) return raw;
		if (entry.method !== METHOD_DEFLATE) {
			throw new ZipFormatError(
				`Unsupported compression method ${entry.method} for ${entry.name}`,
			);
		}
		const inflated = raw
			.stream()
			.pipeThrough(new DecompressionStream("deflate-raw"));
		const blob = await new Response(inflated).blob();
		return blob.slice(0, blob.size, type);
	};

	return {
		has: (name) => entries.has(name),
		names: () => [...entries.keys()],
		async blob(name, type) {
			const entry = entries.get(name);
			return entry ? readBlob(entry, type) : undefined;
		},
		async bytes(name) {
			const entry = entries.get(name);
			if (!entry) return undefined;
			return new Uint8Array(await (await readBlob(entry, "")).arrayBuffer());
		},
		async text(name) {
			const entry = entries.get(name);
			if (!entry) return undefined;
			const text = await (await readBlob(entry, "text/plain")).text();
			// Strip a UTF-8 BOM; XML parsers choke on it.
			return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
		},
	};
}

/**
 * Locate the central directory, following the ZIP64 records when the classic
 * EOCD fields are saturated (>4GB offsets or >65535 entries).
 */
async function findCentralDirectory(
	file: Blob,
): Promise<{ cdOffset: number; cdSize: number }> {
	if (file.size < 22) throw new ZipFormatError("File too small to be a ZIP");

	const tailLength = Math.min(file.size, EOCD_MAX_SCAN);
	const tailStart = file.size - tailLength;
	const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
	const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

	for (let i = tail.length - 22; i >= 0; i -= 1) {
		if (tail[i] !== 0x50 || tail[i + 1] !== 0x4b) continue;
		if (tailView.getUint32(i, true) !== EOCD_SIG) continue;

		const entryCount = tailView.getUint16(i + 10, true);
		const cdSize = tailView.getUint32(i + 12, true);
		const cdOffset = tailView.getUint32(i + 16, true);

		if (cdSize !== U32_MAX && cdOffset !== U32_MAX && entryCount !== U16_MAX) {
			return { cdOffset, cdSize };
		}
		return readZip64Locator(file, tailView, i);
	}
	throw new ZipFormatError("No end-of-central-directory record found");
}

/** The ZIP64 locator sits immediately before the classic EOCD and points at
 *  the ZIP64 EOCD record, which carries the real 64-bit offsets. */
async function readZip64Locator(
	file: Blob,
	tailView: DataView,
	eocdIndex: number,
): Promise<{ cdOffset: number; cdSize: number }> {
	const locatorIndex = eocdIndex - 20;
	if (
		locatorIndex < 0 ||
		tailView.getUint32(locatorIndex, true) !== EOCD64_LOCATOR_SIG
	) {
		throw new ZipFormatError(
			"ZIP64 end-of-central-directory locator not found",
		);
	}

	const eocd64Offset = readU64(tailView, locatorIndex + 8);
	const record = new Uint8Array(
		await file.slice(eocd64Offset, eocd64Offset + 56).arrayBuffer(),
	);
	if (record.length < 56) {
		throw new ZipFormatError("Truncated ZIP64 end-of-central-directory record");
	}
	const view = new DataView(
		record.buffer,
		record.byteOffset,
		record.byteLength,
	);
	if (view.getUint32(0, true) !== EOCD64_SIG) {
		throw new ZipFormatError("Bad ZIP64 end-of-central-directory signature");
	}
	return { cdSize: readU64(view, 40), cdOffset: readU64(view, 48) };
}

async function readCentralDirectory(
	file: Blob,
	offset: number,
	size: number,
): Promise<Map<string, ZipEntry>> {
	const buf = new Uint8Array(
		await file.slice(offset, offset + size).arrayBuffer(),
	);
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const entries = new Map<string, ZipEntry>();
	let p = 0;

	while (p + 46 <= buf.length) {
		if (view.getUint32(p, true) !== CD_SIG) break;

		const method = view.getUint16(p + 10, true);
		const nameLength = view.getUint16(p + 28, true);
		const extraLength = view.getUint16(p + 30, true);
		const commentLength = view.getUint16(p + 32, true);
		const name = textDecoder.decode(buf.subarray(p + 46, p + 46 + nameLength));

		const sizes = resolveZip64Sizes(
			{
				uncompressedSize: view.getUint32(p + 24, true),
				compressedSize: view.getUint32(p + 20, true),
				localHeaderOffset: view.getUint32(p + 42, true),
			},
			buf.subarray(p + 46 + nameLength, p + 46 + nameLength + extraLength),
			name,
		);

		entries.set(name, { name, method, ...sizes });
		p += 46 + nameLength + extraLength + commentLength;
	}

	if (!entries.size) throw new ZipFormatError("Empty central directory");
	return entries;
}

interface EntrySizes {
	uncompressedSize: number;
	compressedSize: number;
	localHeaderOffset: number;
}

/**
 * A saturated (0xffffffff) size or offset means the real value lives in the
 * ZIP64 extra field, which packs only the saturated ones, in a fixed order.
 */
function resolveZip64Sizes(
	base: EntrySizes,
	extra: Uint8Array,
	name: string,
): EntrySizes {
	const saturated =
		base.uncompressedSize === U32_MAX ||
		base.compressedSize === U32_MAX ||
		base.localHeaderOffset === U32_MAX;
	if (!saturated) return base;

	const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
	let p = 0;
	while (p + 4 <= extra.length) {
		const id = view.getUint16(p, true);
		const size = view.getUint16(p + 2, true);
		if (id !== ZIP64_EXTRA_ID) {
			p += 4 + size;
			continue;
		}

		let q = p + 4;
		const next = () => {
			if (q + 8 > extra.length) {
				throw new ZipFormatError(`Truncated ZIP64 extra field for ${name}`);
			}
			const value = readU64(view, q);
			q += 8;
			return value;
		};
		return {
			uncompressedSize:
				base.uncompressedSize === U32_MAX ? next() : base.uncompressedSize,
			compressedSize:
				base.compressedSize === U32_MAX ? next() : base.compressedSize,
			localHeaderOffset:
				base.localHeaderOffset === U32_MAX ? next() : base.localHeaderOffset,
		};
	}
	throw new ZipFormatError(`Missing ZIP64 extra field for ${name}`);
}

/** ZIP64 stores 64-bit little-endian values; Number is exact to 2^53, far past
 *  any EPUB, so this stays a plain number rather than a BigInt. */
function readU64(view: DataView, offset: number): number {
	const value = view.getBigUint64(offset, true);
	if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new ZipFormatError("ZIP64 value exceeds the safe integer range");
	}
	return Number(value);
}
