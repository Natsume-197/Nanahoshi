import * as fs from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { Parser } from "htmlparser2";
import StreamZip from "node-stream-zip";
import {
	getConvertedEpubPath,
	needsConversion,
} from "../../../../modules/conversion/converter";
import { LibraryRepository } from "../../../libraries/library.repository";
import { bookRepository } from "../../book.repository";
import type { Author, BookMetadata, Publisher } from "../book.metadata.model";

// Types
type IEpubSpine = string[];

// TODO: add character count as a later job

export type NavigationItem = {
	/**
	 * Display text for the navigation item.
	 */
	text: string;

	/**
	 * Should be a valid Section.id.
	 */
	id?: string;

	/**
	 * Optional file reference for the navigation item.
	 */
	file?: string;
};

export type Section = {
	name: string;
	lastIndex: number;
	content: string;
};

export type SourceImage = {
	filename: string;
	blob: Blob;
	url?: string;
};
type XmlMetadataDocument = {
	package?: {
		metadata?: Record<string, unknown>;
		manifest?: { item?: unknown };
		spine?: { itemref?: unknown };
	};
};
type ZipReader = {
	entryData: (name: string) => Promise<Buffer | undefined>;
};

interface IEpubMetadata {
	identifier: string;
	title: string;
	language: string;
	creator: string[];
	date?: string;
	subtitle: string;
	description: string;
	publisher: string | null;
}

export class EpubBook {
	kind = "epub";

	localId!: number;
	uniqueId!: string;
	createdAt: string = new Date().toISOString();
	updatedAt: string = new Date().toISOString();
	title!: string;
	language!: string;
	creator!: string[];
	totalChars!: number;

	subtitle: string | null = null;
	description: string | null = null;
	publisher: string | null = null;
	date: string | undefined = undefined;

	// nav: NavigationItem[] = []
	// sections: Section[] = []
	// css = ""
	images: SourceImage[] = [];
	cover: string | null = null;
}

export class LocalProvider {
	private libraryRepository = new LibraryRepository();

	async getMetadata(
		input: Partial<BookMetadata> & { bookId?: number; uuid: string },
	): Promise<Partial<BookMetadata>> {
		if (!input.bookId) return {};

		const filePath = await this.getBookFilePath(input.bookId);

		if (!filePath) {
			console.error(
				`[LocalProvider] No se encontró el archivo para bookId ${input.bookId}`,
			);
			return {};
		}

		let book: EpubBook;
		try {
			book = await parseEpub(filePath, {
				id: input.bookId,
				uuid: input.uuid,
			});
		} catch (error) {
			console.warn(
				`[LocalProvider] No se pudo extraer metadata del EPUB bookId ${input.bookId}`,
				error,
			);
			return {};
		}

		const authors: Author[] =
			book.creator?.map((name) => ({ name, role: null })) ?? [];

		const publisher: Publisher | undefined = book.publisher
			? { name: book.publisher }
			: undefined;

		return {
			title: book.title || undefined,
			subtitle: book.subtitle || undefined,
			description: book.description || undefined,
			authors: authors || undefined,
			publishedDate: book.date || undefined,
			languageCode: book.language || undefined,
			pageCount: null,
			isbn10: null,
			isbn13: null,
			asin: null,
			cover: book.cover || undefined,
			amountChars: book.totalChars || null,
			publisher: publisher || undefined,
		};
	}

	private async getBookFilePath(bookId: number): Promise<string | null> {
		const book = await bookRepository.getById(bookId);
		if (!book?.relativePath || !book.libraryPathId || !book.libraryId) {
			return null;
		}

		// For converted formats, use the converted EPUB
		if (needsConversion(book.filename)) {
			return getConvertedEpubPath(book.uuid);
		}

		// Traemos todos los paths de la librería
		const paths = await this.libraryRepository.findPathsByLibraryId(
			book.libraryId,
		);
		if (!paths?.length) return null;

		// Buscamos el path correspondiente al libro
		const libraryPath = paths.find((p) => p.id === book.libraryPathId);
		if (!libraryPath) return null;

		// Normalizamos la ruta relativa y unimos
		const normalizedRelative = path.normalize(book.relativePath);
		return path.join(libraryPath.path, normalizedRelative);
	}
}

// Orchestrator
async function parseEpub(
	filePath: string,
	book: { id: number; uuid: string },
): Promise<EpubBook> {
	const zip = new StreamZip.async({ file: filePath });
	const parser = new XMLParser({
		ignoreAttributes: false,
		removeNSPrefix: true,
	});
	const epubBook = new EpubBook();

	try {
		// 1. container.xml
		const containerXmlRaw = await zip.entryData("META-INF/container.xml");
		if (!containerXmlRaw) {
			throw new Error("META-INF/container.xml not found. Not valid epub file.");
		}
		const containerXml = parser.parse(containerXmlRaw.toString());

		const rootFiles = containerXml.container.rootfiles.rootfile;
		const rootFile = Array.isArray(rootFiles) ? rootFiles[0] : rootFiles;

		// 2. package.opf
		const opfFilename = rootFile["@_full-path"];
		const pkgDocumentRaw = await zip.entryData(opfFilename);
		if (!pkgDocumentRaw) {
			throw new Error(
				"Package Document file (.opf) not found. Not a valid epub file.",
			);
		}
		const pkgDocumentXml = parser.parse(pkgDocumentRaw.toString());

		let basePath = "";
		const idx = opfFilename.lastIndexOf("/");
		if (idx > -1) {
			basePath = opfFilename.slice(0, idx);
		}

		const metadata = extractMetadata(pkgDocumentXml);
		epubBook.title = metadata.title;
		epubBook.creator = metadata.creator;
		epubBook.language = metadata.language;
		epubBook.uniqueId = metadata.identifier || book.uuid;

		epubBook.subtitle = metadata.subtitle || null;
		epubBook.description = metadata.description || null;
		epubBook.publisher = metadata.publisher || null;
		epubBook.date = metadata.date;

		const coverPath = await extractCover(
			zip,
			pkgDocumentXml,
			basePath,
			book.uuid,
		);
		if (coverPath) {
			epubBook.cover = coverPath;
		}

		return epubBook;
	} finally {
		await zip.close();
	}
}

// Core functions EPUB extractor

export function extractMetadata(pkgDocumentXml: unknown) {
	const pkgDocument = pkgDocumentXml as XmlMetadataDocument;
	if (!pkgDocument?.package) {
		throw new Error("Package element not found. Not a valid epub file.");
	}
	const metadataNode = pkgDocument.package.metadata;
	if (!metadataNode) {
		throw new Error("Metadata not found. Not a valid epub file.");
	}

	const metadata: IEpubMetadata = {
		identifier: "",
		title: "",
		language: "",
		creator: [],
		subtitle: "",
		description: "",
		publisher: null,
		date: undefined,
	};

	// identifier. According to the specs, there can be more than one id
	const ids = getDcMetadataField(metadataNode, "identifier");
	if (ids) {
		metadata.identifier = String(extractId(ids));
	}

	// title
	const titles = getDcMetadataField(metadataNode, "title");
	metadata.title = extractText(titles) ?? "";

	// language
	const langs = getDcMetadataField(metadataNode, "language");
	metadata.language = extractText(langs) ?? "";

	// creators (authors)
	const authorFields = ["creator", "authors", "author", "author(s)"];
	for (const field of authorFields) {
		const raw = getDcMetadataField(metadataNode, field);
		if (!raw) continue;

		if (Array.isArray(raw)) {
			for (const r of raw) {
				const author = extractText(r);
				if (author) metadata.creator.push(author);
			}
		} else {
			const author = extractText(raw);
			if (author) metadata.creator.push(author);
		}
	}

	// published date
	const date = getDcMetadataField(metadataNode, "date");
	if (date) {
		metadata.date = extractText(date) ?? undefined;
	}

	// subtitle (not standard)
	const subtitle = getDcMetadataField(metadataNode, "subtitle");
	metadata.subtitle = extractText(subtitle) ?? "";

	// description (not standard)
	const description = getDcMetadataField(metadataNode, "description");
	metadata.description = extractText(description) ?? "";

	// publisher
	const publisher = getDcMetadataField(metadataNode, "publisher");
	metadata.publisher = extractText(publisher);

	return metadata;
}

function getDcMetadataField(
	metadataNode: Record<string, unknown>,
	field: string,
): unknown {
	return metadataNode[field] ?? metadataNode[`dc:${field}`];
}

async function extractCover(
	zip: ZipReader,
	pkgDocumentXml: unknown,
	basePath: string,
	bookId: string,
) {
	const pkgDocument = pkgDocumentXml as XmlMetadataDocument;
	const items = pkgDocument.package?.manifest?.item;
	if (!items) return null;

	const arr = Array.isArray(items) ? items : [items];

	// Build a map of manifest items by id for quick lookup
	const itemById = new Map<string, (typeof arr)[number]>();
	let rasterCoverHref: string | null = null;
	let svgCoverHref: string | null = null;

	for (const item of arr) {
		if (!item || typeof item !== "object") continue;

		const id = (item["@_id"] as string) ?? "";
		if (id) itemById.set(id, item);

		const type = item["@_media-type"] as string | undefined;
		const href = item["@_href"] as string | undefined;
		const lId = id.toLowerCase();
		const props = (item["@_properties"] as string)?.toLowerCase() ?? "";
		const isCover = lId.includes("cover") || props.includes("cover");

		if (!isCover || !type?.startsWith("image/") || !href) continue;

		if (type === "image/svg+xml") {
			svgCoverHref ??= href;
		} else {
			rasterCoverHref = href;
			break;
		}
	}

	// Also check <meta name="cover" content="item-id"> (EPUB 2 pattern)
	if (!rasterCoverHref) {
		const metadata = pkgDocument.package?.metadata;
		const metaArr = metadata
			? Array.isArray(metadata.meta)
				? metadata.meta
				: metadata.meta
					? [metadata.meta]
					: []
			: [];
		for (const meta of metaArr) {
			if (
				meta &&
				typeof meta === "object" &&
				(meta as Record<string, unknown>)["@_name"] === "cover"
			) {
				const refId = (meta as Record<string, unknown>)["@_content"] as string;
				const refItem = refId ? itemById.get(refId) : undefined;
				if (refItem) {
					const refType = refItem["@_media-type"] as string | undefined;
					const refHref = refItem["@_href"] as string | undefined;
					if (refType?.startsWith("image/") && refHref) {
						if (refType !== "image/svg+xml") {
							rasterCoverHref = refHref;
						} else {
							svgCoverHref ??= refHref;
						}
					}
				}
				break;
			}
		}
	}

	// If we only have an SVG cover, try to extract embedded raster image from it
	let coverHref = rasterCoverHref;
	if (!coverHref && svgCoverHref) {
		const svgFullPath = basePath ? `${basePath}/${svgCoverHref}` : svgCoverHref;
		const svgBuffer = await zip.entryData(svgFullPath);
		if (svgBuffer) {
			const embeddedHref = extractImageHrefFromSvg(svgBuffer.toString("utf-8"));
			if (embeddedHref) {
				// Resolve the embedded href relative to the SVG's directory
				const svgDir = path.dirname(svgCoverHref);
				coverHref =
					svgDir && svgDir !== "." ? `${svgDir}/${embeddedHref}` : embeddedHref;
			}
		}
	}

	if (!coverHref) return null;

	const fullCoverPath = basePath ? `${basePath}/${coverHref}` : coverHref;
	const coverBuffer = await zip.entryData(fullCoverPath);
	if (!coverBuffer) return null;

	const ext = path.extname(coverHref).toLowerCase() || ".jpg";
	const coversDir = path.join(process.cwd(), "data/covers");
	await fs.mkdir(coversDir, { recursive: true });

	const coverPath = path.join(coversDir, `${bookId}${ext}`);

	await fs.writeFile(coverPath, coverBuffer, { flag: "wx" }).catch(() => {
		// File already exists, skip writing
	});

	return path.relative(process.cwd(), coverPath);
}

/**
 * Extracts the href/src of an embedded raster image from an SVG string.
 * EPUBs commonly wrap a raster image inside an SVG `<image>` element.
 */
function extractImageHrefFromSvg(svg: string): string | null {
	const imageMatch = svg.match(
		/<image[^>]+(?:href|xlink:href)\s*=\s*["']([^"']+)["']/i,
	);
	return imageMatch?.[1] ?? null;
}

// Auxiliar functions to extract metadata

/**
 * Retrieves the id of the epub book, sometimes the epub have more than one id,
 * this function will prioritize uuid
 * @param element - <dc:identifier> xml array
 * @returns epub identifier
 */
function extractId(element: unknown): string {
	if (typeof element === "string") {
		return element;
	}

	// btw (typeof null === "object") -> true
	if (typeof element === "object" && element !== null && "#text" in element) {
		return getTextNodeValue(element) ?? "";
	}

	// this should never happen
	assert(
		Array.isArray(element),
		"Invalid identifier format: expected an array.",
	);

	let fallbackId = "";

	for (const node of element as Array<unknown>) {
		if (typeof node === "string") {
			fallbackId = node;
			continue;
		}

		if (typeof node === "object" && node !== null) {
			const nodeObject = node as Record<string, unknown>;
			if ("@_id" in nodeObject && nodeObject["@_id"] === "uuid_id") {
				return extractText(node) ?? "";
			}

			const text = extractText(node);
			if (text) {
				fallbackId = text;
			}
		}
	}

	return fallbackId;
}

function extractText(element: unknown): string | null {
	if (Array.isArray(element)) {
		return extractText(element[0]);
	}

	if (typeof element === "string") {
		return element;
	}

	if (typeof element === "object" && element !== null && "#text" in element) {
		return getTextNodeValue(element);
	}
	return null;
}

function getTextNodeValue(element: object): string | null {
	const text = (element as Record<string, unknown>)["#text"];
	return typeof text === "string" ? text : null;
}

function _extractSpine(pkgDocumentXml: unknown): IEpubSpine {
	const pkgDocument = pkgDocumentXml as XmlMetadataDocument;
	const items = pkgDocument.package?.spine?.itemref;
	if (!items || !Array.isArray(items)) {
		throw new Error(
			"Package Document Item(s) not found. Not a valid epub file.",
		);
	}

	const itemref = [];
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (!item || typeof item !== "object") continue;
		if (item["@_idref"]) itemref.push(item["@_idref"]);
	}

	return itemref;
}

function _getFilePath(basePath: string, fn: string): string {
	return basePath ? `${basePath}/${fn}` : fn;
}

function getBaseName(path: string) {
	const match = path.match(/(?:.*\/)?([^/]+\.(?:png|jpe?g|svg|xhtml|html))$/i);
	return match ? match[1] : path;
}

// https://www.w3.org/TR/epub-33/#sec-nav-def-model
function _parseNavigator(navContent: string): NavigationItem[] {
	const starttime = Date.now();
	const nav = navContent;

	let insideNav = false;
	let insideLi = false;
	const items: NavigationItem[] = [];

	const parser = new Parser({
		onopentag(name, attribs) {
			if (name === "nav" && Object.hasOwn(attribs, "epub:type")) {
				insideNav = true;
				return;
			}
			if (!insideNav) return;

			if (name === "li") {
				insideLi = true;
				return;
			}

			if (insideLi && name === "a") {
				const href = attribs.href;
				if (!href) return;

				const [filepath = href, id] = href.split("#");
				const current: { text: string; file?: string; id?: string } = {
					file: getBaseName(filepath),
					text: "none",
				};

				if (id) current.id = id;
				items.push(current);
			}

			if (insideLi && name === "span") {
				items.push({ text: "none" });
				return;
			}
		},

		onclosetag(name) {
			if (name === "nav") {
				insideNav = false;
				return;
			}

			if (!insideNav) return;
			if (name === "li") insideLi = false;
		},

		ontext(text) {
			if (!insideLi || text.trim() === "") return;

			const lastItem = items.at(-1);
			if (lastItem) {
				lastItem.text = text;
			}
		},
	});

	parser.write(nav);
	parser.end();
	console.log(`Navigator parsed in ${Date.now() - starttime}ms`);

	return items;
}

function _parseBodyContent(
	filename: string,
	xhtml: string,
	initialId: number,
	initialChars: number,
	lang: string,
): [string, number, number] {
	let id = initialId;
	let insideBody = false;
	let insideP = 0;
	let insideRt = 0;
	const content: string[] = [];
	let charsCount = initialChars;

	const parser = new Parser({
		onopentag(name, attribs) {
			if (name === "body") {
				insideBody = true;
				return;
			}

			if (!insideBody) return;

			if (name === "img" || name === "image") {
				attribs.index = id.toString();
				attribs.charAcumm = charsCount.toString();
				id++;
			}

			if (name === "p") {
				insideP++;
				attribs.index = id.toString();
				attribs.charAcumm = charsCount.toString();
				id++;
			}
			if (name === "rt") insideRt++;

			const attrs = Object.entries(attribs)
				.map(([k, v]) => `${k}="${v}"`)
				.join(" ");

			content.push(attrs ? `<${name} ${attrs}>` : `<${name}>`);
		},

		onclosetag(name) {
			if (name === "body") {
				insideBody = false;
				return;
			}

			if (!insideBody) return;

			if (name === "p") insideP = Math.max(insideP - 1, 0);
			if (name === "rt") insideRt = Math.max(insideRt - 1, 0);

			content.push(`</${name}>`);
		},

		ontext(text) {
			if (!insideBody) return;
			content.push(text);

			// Count only if inside <p> and NOT inside <rt>
			if (insideP > 0 && insideRt === 0) {
				charsCount += getCharacterCountByLanguage(text, lang);
			}
		},
	});

	content.push(`<div id="${getBaseName(filename)}">`);
	parser.write(xhtml);
	parser.end();
	content.push("</div>");

	return [content.join(""), id, charsCount];
}

void [_extractSpine, _getFilePath, _parseNavigator, _parseBodyContent];

function getCharacterCountByLanguage(text: string, lang: string): number {
	switch (lang) {
		case "ja":
			return getJapaneseCharacterCount(text);
		default:
			return getTextCharacterCount(text);
	}
}

// Count Japanese characters (Hiragana, Katakana, Kanji)
function getJapaneseCharacterCount(text: string): number {
	if (!text) return 0;
	const japaneseRegex =
		/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々〻]/gu;
	const matches = text.match(japaneseRegex);
	return matches ? matches.length : 0;
}

// Count all characters except symbols/punctuation
function getTextCharacterCount(text: string): number {
	if (!text) return 0;
	// \p{L} = letters, \p{N} = numbers, \p{Zs} = space separators
	const textRegex = /[\p{L}\p{N}\p{Zs}]+/gu;
	const matches = text.match(textRegex);
	if (!matches) return 0;
	return matches.reduce((sum, m) => sum + [...m].length, 0);
}

// Very simple css parser to avoid bloated dependencies
export function parseCss(cssText: string) {
	const rules = [];
	let cursor = 0;
	const len = cssText.length;

	while (cursor < len) {
		// find next valid char (ignore whitespaces and line jumps)
		while (cursor < len && /\s/.test(cssText.charAt(cursor))) cursor++;

		// start of selector
		const selectorStart = cursor;
		while (cursor < len && cssText.charAt(cursor) !== "{") cursor++;
		const selector = cssText.slice(selectorStart, cursor).trim();

		if (!selector) break;

		// skip {
		cursor++;
		let level = 1;
		const blockStart = cursor;
		while (cursor < len && level > 0) {
			if (cssText[cursor] === "{") {
				level++;
			} else if (cssText[cursor] === "}") {
				level--;
			}

			cursor++;
		}

		// bg-* no avoid problems with tailwind
		if (selector[0] === "." && !selector.includes(".bg-")) {
			// ignore empty classes
			if (cssText.slice(blockStart, cursor).trim() === "}") continue;
			rules.push(cssText.slice(selectorStart, cursor));
		}
	}

	return rules;
}

export function assert(
	condition: unknown,
	message = "Assertion failed",
): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

export const localProvider = new LocalProvider();
