import { XMLParser } from "fast-xml-parser";
import type {
	EbookDocument,
	EbookFormat,
	EbookMetadata,
	EbookResource,
} from "../ebook";
import type { ComicArchive } from "./archive";

type ComicFormat = Extract<EbookFormat, "cbz" | "cbr" | "cb7">;
type XmlNode = Record<string, unknown>;

interface ComicInfo {
	metadata: EbookMetadata;
	coverIndex?: number;
}

const IMAGE_MEDIA_TYPES: Readonly<Record<string, string>> = {
	avif: "image/avif",
	bmp: "image/bmp",
	gif: "image/gif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
};

const comicInfoParser = new XMLParser({
	ignoreAttributes: false,
	removeNSPrefix: true,
	parseTagValue: false,
	trimValues: true,
});

export async function openComicArchive(
	archive: ComicArchive,
	format: ComicFormat,
): Promise<EbookDocument> {
	try {
		const names = archive.names();
		const imageNames = names
			.filter(isReadableImage)
			.filter((name) => !isIgnoredArchivePath(name))
			.sort(naturalPathCompare);
		if (!imageNames.length) {
			throw new Error(`Invalid ${format.toUpperCase()}: no readable images`);
		}

		const comicInfoName = findComicInfo(names);
		const comicInfo = comicInfoName
			? parseComicInfo(await archive.read(comicInfoName))
			: emptyComicInfo();
		const coverName =
			comicInfo.coverIndex === undefined
				? imageNames[0]
				: (imageNames[comicInfo.coverIndex] ?? imageNames[0]);

		return {
			format,
			metadata: comicInfo.metadata,
			content: {
				kind: "pages",
				pages: imageNames.map((name, index) => ({
					id: name,
					label: `Page ${index + 1}`,
				})),
				openPage: (id) => openImage(archive, id, imageNames),
			},
			async openCover() {
				return coverName
					? await openImage(archive, coverName, imageNames)
					: undefined;
			},
			close: () => archive.close(),
		};
	} catch (error) {
		await archive.close();
		throw error;
	}
}

async function openImage(
	archive: ComicArchive,
	name: string,
	allowedNames: readonly string[],
): Promise<EbookResource | undefined> {
	if (!allowedNames.includes(name)) return undefined;
	const data = await archive.read(name);
	const mediaType = imageMediaType(name);
	return data && mediaType ? { data, mediaType } : undefined;
}

function isReadableImage(name: string): boolean {
	return imageMediaType(name) !== undefined;
}

function imageMediaType(name: string): string | undefined {
	const extension = name.toLowerCase().match(/\.([^./]+)$/)?.[1];
	return extension ? IMAGE_MEDIA_TYPES[extension] : undefined;
}

function isIgnoredArchivePath(name: string): boolean {
	return name
		.replaceAll("\\", "/")
		.split("/")
		.some((part) => part === "__MACOSX" || part.startsWith("."));
}

function findComicInfo(names: readonly string[]): string | undefined {
	const candidates = names.filter(
		(name) =>
			name.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase() ===
			"comicinfo.xml",
	);
	return candidates.sort((left, right) => {
		const leftDepth = left.split(/[\\/]/).length;
		const rightDepth = right.split(/[\\/]/).length;
		return leftDepth - rightDepth || naturalPathCompare(left, right);
	})[0];
}

function parseComicInfo(data: Uint8Array | undefined): ComicInfo {
	if (!data) return emptyComicInfo();
	const xml = new TextDecoder().decode(data);
	if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
		throw new Error("ComicInfo.xml with DTD declarations is not supported");
	}
	const parsed = comicInfoParser.parse(xml) as XmlNode;
	const root = asObject(parsed.ComicInfo);
	if (!root) return emptyComicInfo();

	const series = text(root.Series);
	const number = text(root.Number);
	const title =
		text(root.Title) ||
		[series, number && `#${number}`].filter(Boolean).join(" ");
	const writers = people(root.Writer);
	const visualAuthors = people(root.Penciller);
	const contributors = [
		...people(root.Inker),
		...people(root.Colorist),
		...people(root.Letterer),
		...people(root.CoverArtist),
		...people(root.Editor),
		...people(root.Translator),
	];

	return {
		metadata: {
			identifier: "",
			identifiers: [],
			title,
			subtitle: text(root.AlternateSeries),
			authors: unique([...writers, ...visualAuthors]),
			publisher: text(root.Publisher),
			language: text(root.LanguageISO),
			published: publicationDate(root),
			description: text(root.Summary),
			subjects: splitList(text(root.Genre)),
			rights: "",
			contributors: unique(contributors),
			presentation: {
				layout: "pre-paginated",
				spread: null,
				declaresPageResolution: true,
			},
		},
		coverIndex: frontCoverIndex(root),
	};
}

function emptyComicInfo(): ComicInfo {
	return {
		metadata: {
			identifier: "",
			identifiers: [],
			title: "",
			subtitle: "",
			authors: [],
			publisher: "",
			language: "",
			published: "",
			description: "",
			subjects: [],
			rights: "",
			contributors: [],
			presentation: {
				layout: "pre-paginated",
				spread: null,
				declaresPageResolution: true,
			},
		},
	};
}

function frontCoverIndex(root: XmlNode): number | undefined {
	const pages = asArray(asObject(root.Pages)?.Page);
	for (const page of pages) {
		const node = asObject(page);
		if (!node || text(node["@_Type"]).toLowerCase() !== "frontcover") continue;
		const index = Number.parseInt(text(node["@_Image"]), 10);
		if (Number.isInteger(index) && index >= 0) return index;
	}
	return undefined;
}

function publicationDate(root: XmlNode): string {
	const year = integerPart(root.Year, 1, 9999);
	if (!year) return "";
	const month = integerPart(root.Month, 1, 12);
	const day = integerPart(root.Day, 1, 31);
	return [
		String(year).padStart(4, "0"),
		month && String(month).padStart(2, "0"),
		day && String(day).padStart(2, "0"),
	]
		.filter(Boolean)
		.join("-");
}

function integerPart(
	value: unknown,
	min: number,
	max: number,
): number | undefined {
	const parsed = Number.parseInt(text(value), 10);
	return Number.isInteger(parsed) && parsed >= min && parsed <= max
		? parsed
		: undefined;
}

function people(value: unknown): string[] {
	return splitList(text(value));
}

function splitList(value: string): string[] {
	return value
		.split(/[;,]/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function asObject(value: unknown): XmlNode | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as XmlNode)
		: undefined;
}

function asArray(value: unknown): unknown[] {
	return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
	if (typeof value === "string" || typeof value === "number") {
		return String(value).trim();
	}
	const node = asObject(value);
	return node ? text(node["#text"]) : "";
}

export function naturalPathCompare(left: string, right: string): number {
	const leftParts = tokenizePath(left);
	const rightParts = tokenizePath(right);
	const count = Math.max(leftParts.length, rightParts.length);
	for (let index = 0; index < count; index++) {
		const leftPart = leftParts[index];
		const rightPart = rightParts[index];
		if (leftPart === undefined) return -1;
		if (rightPart === undefined) return 1;
		const compared = compareNaturalPart(leftPart, rightPart);
		if (compared) return compared;
	}
	return left < right ? -1 : left > right ? 1 : 0;
}

function tokenizePath(value: string): string[] {
	return (
		value
			.replaceAll("\\", "/")
			.toLowerCase()
			.match(/\d+|\D+/g) ?? []
	);
}

function compareNaturalPart(left: string, right: string): number {
	const numeric = /^\d+$/;
	if (!numeric.test(left) || !numeric.test(right)) {
		return left < right ? -1 : left > right ? 1 : 0;
	}
	const leftValue = left.replace(/^0+/, "") || "0";
	const rightValue = right.replace(/^0+/, "") || "0";
	if (leftValue.length !== rightValue.length)
		return leftValue.length - rightValue.length;
	if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1;
	return left.length - right.length;
}
