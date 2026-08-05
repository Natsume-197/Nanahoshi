import {
	countSetBits,
	countTrailingZeroBits,
	decoderFor,
	readString,
	readUint,
	readVariableLength,
} from "./binary";

export interface IndexTableItem {
	name: string;
	tags: Record<number, number[]>;
}

export interface IndexData {
	table: IndexTableItem[];
	strings: Record<number, string>;
}

export interface NcxItem {
	index: number;
	offset?: number;
	label: string;
	headingLevel?: number;
	position?: number[];
	parent?: number;
	firstChild?: number;
	children?: NcxItem[];
}

interface IndexHeader {
	length: number;
	idxt: number;
	numRecords: number;
	encoding: number;
	numCncx: number;
}

export function readIndexData(
	indexRecord: number,
	loadRecord: (index: number) => Uint8Array,
): IndexData {
	const root = loadRecord(indexRecord);
	const rootHeader = readIndexHeader(root);
	const decoder = decoderFor(rootHeader.encoding);
	const strings: Record<number, string> = {};
	let stringBase = 0;

	for (let index = 0; index < rootHeader.numCncx; index++) {
		const record = loadRecord(indexRecord + rootHeader.numRecords + index + 1);
		for (let position = 0; position < record.length; ) {
			const entryOffset = position;
			const length = readVariableLength(record, position);
			if (
				!length.length ||
				position + length.length + length.value > record.length
			)
				break;
			position += length.length;
			strings[stringBase + entryOffset] = decoder.decode(
				record.subarray(position, position + length.value),
			);
			position += length.value;
		}
		stringBase += 0x1_0000;
	}

	const tagxOffset = rootHeader.length;
	if (readString(root, tagxOffset, 4) !== "TAGX")
		throw new Error("Invalid TAGX section");
	const tagxLength = readUint(root, tagxOffset + 4, 4);
	const controlByteCount = readUint(root, tagxOffset + 8, 4);
	const tagCount = Math.floor((tagxLength - 12) / 4);
	const tagTable = Array.from({ length: tagCount }, (_, index) =>
		root.subarray(tagxOffset + 12 + index * 4, tagxOffset + 16 + index * 4),
	);
	const table: IndexTableItem[] = [];

	for (
		let recordIndex = 0;
		recordIndex < rootHeader.numRecords;
		recordIndex++
	) {
		const record = loadRecord(indexRecord + 1 + recordIndex);
		const header = readIndexHeader(record);
		for (let entryIndex = 0; entryIndex < header.numRecords; entryIndex++) {
			const offsetPointer = header.idxt + 4 + entryIndex * 2;
			const offset = readUint(record, offsetPointer, 2);
			const nameLength = readUint(record, offset, 1);
			const name = decoder.decode(
				record.subarray(offset + 1, offset + 1 + nameLength),
			);
			const start = offset + 1 + nameLength;
			let controlByteIndex = 0;
			let position = start + controlByteCount;
			const pending: [
				tag: number,
				count: number,
				byteLength: number,
				valuesPerEntry: number,
			][] = [];

			for (const definition of tagTable) {
				const tag = definition[0] ?? 0;
				const valuesPerEntry = definition[1] ?? 0;
				const mask = definition[2] ?? 0;
				const end = definition[3] ?? 0;
				if (end & 1) {
					controlByteIndex++;
					continue;
				}
				const control = (record[start + controlByteIndex] ?? 0) & mask;
				if (control === mask) {
					if (countSetBits(mask) > 1) {
						const encoded = readVariableLength(record, position);
						pending.push([tag, 0, encoded.value, valuesPerEntry]);
						position += encoded.length;
					} else pending.push([tag, 1, 0, valuesPerEntry]);
				} else
					pending.push([
						tag,
						control >>> countTrailingZeroBits(mask),
						0,
						valuesPerEntry,
					]);
			}

			const tags: Record<number, number[]> = {};
			for (const [tag, count, byteLength, valuesPerEntry] of pending) {
				const values: number[] = [];
				if (count) {
					for (
						let valueIndex = 0;
						valueIndex < count * valuesPerEntry;
						valueIndex++
					) {
						const encoded = readVariableLength(record, position);
						values.push(encoded.value);
						position += encoded.length;
					}
				} else {
					const end = position + byteLength;
					while (position < end) {
						const encoded = readVariableLength(record, position);
						if (!encoded.length) break;
						values.push(encoded.value);
						position += encoded.length;
					}
				}
				tags[tag] = values;
			}
			table.push({ name, tags });
		}
	}

	return { table, strings };
}

export function readNcx(
	indexRecord: number,
	loadRecord: (index: number) => Uint8Array,
): NcxItem[] {
	const { table, strings } = readIndexData(indexRecord, loadRecord);
	const items: NcxItem[] = table.map(({ tags }, index) => ({
		index,
		offset: tags[1]?.[0],
		label: strings[tags[3]?.[0] ?? -1] ?? "",
		headingLevel: tags[4]?.[0],
		position: tags[6],
		parent: tags[21]?.[0],
		firstChild: tags[22]?.[0],
	}));
	const addChildren = (item: NcxItem): NcxItem => {
		if (item.firstChild === undefined) return item;
		return {
			...item,
			children: items
				.filter((candidate) => candidate.parent === item.index)
				.map(addChildren),
		};
	};
	return items.filter((item) => item.headingLevel === 0).map(addChildren);
}

function readIndexHeader(record: Uint8Array): IndexHeader {
	if (readString(record, 0, 4) !== "INDX")
		throw new Error("Invalid INDX record");
	return {
		length: readUint(record, 4, 4),
		idxt: readUint(record, 20, 4),
		numRecords: readUint(record, 24, 4),
		encoding: readUint(record, 28, 4),
		numCncx: readUint(record, 52, 4),
	};
}
