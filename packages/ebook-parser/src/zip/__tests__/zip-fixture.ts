/**
 * Minimal ZIP *writer*, for ZIP reader tests only. Self-contained (no `zip`
 * binary) so the suite runs anywhere, and able to emit the shapes the reader
 * has to cope with: stored, deflated, archive comments, and ZIP64.
 */
import { deflateRawSync } from "node:zlib";

export interface FixtureEntry {
	name: string;
	data: Uint8Array;
	/** Deflate this entry (method 8). Otherwise it is stored (method 0). */
	deflate?: boolean;
}

export interface FixtureOptions {
	comment?: Uint8Array;
	/** Emit ZIP64 records with saturated classic fields. */
	zip64?: boolean;
}

const encoder = new TextEncoder();

export function buildZip(
	entries: FixtureEntry[],
	options: FixtureOptions = {},
): Blob {
	const chunks: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = encoder.encode(entry.name);
		const stored = entry.deflate
			? new Uint8Array(deflateRawSync(entry.data))
			: entry.data;
		const crc = crc32(entry.data);

		const local = new Uint8Array(30 + name.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(4, 20, true); // version needed
		lv.setUint16(6, 0x0800, true); // UTF-8 names
		lv.setUint16(8, entry.deflate ? 8 : 0, true);
		lv.setUint32(14, crc, true);
		lv.setUint32(18, stored.length, true);
		lv.setUint32(22, entry.data.length, true);
		lv.setUint16(26, name.length, true);
		local.set(name, 30);

		const localOffset = offset;
		chunks.push(local, stored);
		offset += local.length + stored.length;

		// ZIP64: saturate the offset in the central record and carry the real
		// value in the extra field — the shape the reader must decode.
		const extra = options.zip64
			? zip64Extra(entry.data.length, stored.length, localOffset)
			: new Uint8Array(0);
		const cd = new Uint8Array(46 + name.length + extra.length);
		const cv = new DataView(cd.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(4, 20, true);
		cv.setUint16(6, 20, true);
		cv.setUint16(8, 0x0800, true);
		cv.setUint16(10, entry.deflate ? 8 : 0, true);
		cv.setUint32(16, crc, true);
		cv.setUint32(20, options.zip64 ? 0xffffffff : stored.length, true);
		cv.setUint32(24, options.zip64 ? 0xffffffff : entry.data.length, true);
		cv.setUint16(28, name.length, true);
		cv.setUint16(30, extra.length, true);
		cv.setUint32(42, options.zip64 ? 0xffffffff : localOffset, true);
		cd.set(name, 46);
		cd.set(extra, 46 + name.length);
		central.push(cd);
	}

	const cdOffset = offset;
	const cdSize = central.reduce((n, c) => n + c.length, 0);
	chunks.push(...central);
	offset += cdSize;

	if (options.zip64) {
		const rec = new Uint8Array(56);
		const rv = new DataView(rec.buffer);
		rv.setUint32(0, 0x06064b50, true);
		rv.setBigUint64(4, BigInt(44), true); // size of remaining record
		rv.setUint16(12, 45, true);
		rv.setUint16(14, 45, true);
		rv.setBigUint64(24, BigInt(entries.length), true);
		rv.setBigUint64(32, BigInt(entries.length), true);
		rv.setBigUint64(40, BigInt(cdSize), true);
		rv.setBigUint64(48, BigInt(cdOffset), true);

		const loc = new Uint8Array(20);
		const lv2 = new DataView(loc.buffer);
		lv2.setUint32(0, 0x07064b50, true);
		lv2.setBigUint64(8, BigInt(offset), true); // where the ZIP64 EOCD starts
		lv2.setUint32(16, 1, true);

		chunks.push(rec, loc);
	}

	const comment = options.comment ?? new Uint8Array(0);
	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, options.zip64 ? 0xffff : entries.length, true);
	ev.setUint16(10, options.zip64 ? 0xffff : entries.length, true);
	ev.setUint32(12, options.zip64 ? 0xffffffff : cdSize, true);
	ev.setUint32(16, options.zip64 ? 0xffffffff : cdOffset, true);
	ev.setUint16(20, comment.length, true);
	chunks.push(eocd, comment);

	return new Blob(chunks as BlobPart[]);
}

function zip64Extra(
	uncompressed: number,
	compressed: number,
	localOffset: number,
): Uint8Array {
	// Order is fixed by the spec: uncompressed, compressed, local offset.
	const extra = new Uint8Array(4 + 24);
	const v = new DataView(extra.buffer);
	v.setUint16(0, 0x0001, true);
	v.setUint16(2, 24, true);
	v.setBigUint64(4, BigInt(uncompressed), true);
	v.setBigUint64(12, BigInt(compressed), true);
	v.setBigUint64(20, BigInt(localOffset), true);
	return extra;
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i += 1) {
		let c = i;
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[i] = c >>> 0;
	}
	return table;
})();

function crc32(data: Uint8Array): number {
	let c = 0xffffffff;
	for (const byte of data) {
		const tableValue = CRC_TABLE[(c ^ byte) & 0xff] ?? 0;
		c = tableValue ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

export function bytes(text: string): Uint8Array {
	return encoder.encode(text);
}
