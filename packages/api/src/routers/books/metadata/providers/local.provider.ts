import { XMLParser } from "fast-xml-parser";
import * as fs from "fs/promises";
import { Parser } from "htmlparser2";
import StreamZip from "node-stream-zip";
import path from "path";
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

interface IEpubManifest {
	/**
	 * Table of contents.
	 */
	nav: NavigationItem[];

	/**
	 * Xhtml (xml) contents (does not include navigation)
	 */
	xhtml: { lastIndex: number; id: string; content: string; name: string }[];

	/**
	 * Imgs of the book.
	 * The first index corresponds to the cover
	 */
	imgs: { filename: string; blob: Blob }[];

	/**
	 * Sanitized css book style. Should be inserted into a style tag to use it.
	 */
	css: string;
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

		const book = await parseEpub(filePath, {
			id: input.bookId,
			uuid: input.uuid,
		});

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
		if (!book?.relativePath || !book.libraryPathId) return null;

		// Traemos todos los paths de la librería
		const paths = await this.libraryRepository.findPathsByLibraryId(book.libraryId);
		if (!paths?.length) return null;

		// Buscamos el path correspondiente al libro
		const libraryPath = paths.find(p => p.id === book.libraryPathId);
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
	const parser = new XMLParser({ ignoreAttributes: false });
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
		epubBook.uniqueId = metadata.identifier;

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

function extractMetadata(pkgDocumentXml: any) {
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
	const ids = pkgDocumentXml.package.metadata["dc:identifier"];
	if (!ids) {
		throw new Error("dc:identifier not found. Not a valid epub file.");
	}

	metadata.identifier = String(extractId(ids));

	// title
	const titles = pkgDocumentXml.package.metadata["dc:title"];
	if (!titles) {
		throw new Error("Title(s) not found. Not a valid epub file.");
	}
	metadata.title = extractText(titles) ?? "";

	// language
	const langs = pkgDocumentXml.package.metadata["dc:language"];
	if (!langs) {
		throw new Error("Language(s) not found. Not a valid epub file.");
	}
	metadata.language = extractText(langs) ?? "";

	// creators (authors)
	const authorFields = [
		"dc:creator",
		"dc:authors",
		"dc:author",
		"dc:author(s)",
	];
	for (const field of authorFields) {
		const raw = pkgDocumentXml.package.metadata[field];
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
	const date = pkgDocumentXml.package.metadata["dc:date"];
	if (date) {
		metadata.date = typeof date === "string" ? date : date["#text"];
	}

	// subtitle (not standard)
	const subtitle = pkgDocumentXml.package.metadata["dc:subtitle"];
	metadata.subtitle = extractText(subtitle) ?? "";

	// description (not standard)
	const description = pkgDocumentXml.package.metadata["dc:description"];
	metadata.description = extractText(description) ?? "";

	// publisher
	const publisher = pkgDocumentXml.package.metadata["dc:publisher"];
	metadata.publisher = extractText(publisher);

	return metadata;
}

async function extractCover(
	zip: any,
	pkgDocumentXml: any,
	basePath: string,
	bookId: string,
) {
	const items = pkgDocumentXml.package?.manifest?.item;
	if (!items) return null;

	const arr = Array.isArray(items) ? items : [items];

	let coverHref: string | null = null;

	for (const item of arr) {
		if (!item || typeof item !== "object") continue;

		const type = item["@_media-type"];
		const href = item["@_href"];
		const id = (item["@_id"] as string)?.toLowerCase() ?? "";
		const props = (item["@_properties"] as string)?.toLowerCase() ?? "";

		if (
			type?.startsWith("image/") &&
			(id.includes("cover") || props.includes("cover"))
		) {
			coverHref = href;
			break;
		}
	}

	if (!coverHref) return null;

	const fullCoverPath = basePath ? `${basePath}/${coverHref}` : coverHref;
	const coverBuffer = await zip.entryData(fullCoverPath);
	if (!coverBuffer) return null;

	const ext = path.extname(coverHref) || ".jpg";
	const coversDir = path.join(process.cwd(), "data/covers");
	await fs.mkdir(coversDir, { recursive: true });

	const coverPath = path.join(coversDir, `${bookId}${ext}`);

	try {
		await fs.access(coverPath);
		// si existe, no lo volvemos a escribir
	} catch {
		await fs.writeFile(coverPath, coverBuffer);
	}

	return path.relative(process.cwd(), coverPath);
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
		return (element as Record<string, string>)["#text"];
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
			if ("@_id" in node && (node as any)["@_id"] === "uuid_id") {
				return extractText(node);
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
		return (element as Record<string, string>)["#text"];
	}
	return null;
}

function extractSpine(pkgDocumentXml: any): IEpubSpine {
	const items = pkgDocumentXml.package?.spine?.itemref;
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

function getFilePath(basePath: string, fn: string): string {
	return basePath ? `${basePath}/${fn}` : fn;
}

function getBaseName(path: string) {
	const match = path.match(/(?:.*\/)?([^/]+\.(?:png|jpe?g|svg|xhtml|html))$/i);
	return match ? match[1] : path;
}

// https://www.w3.org/TR/epub-33/#sec-nav-def-model
function parseNavigator(navContent: string): NavigationItem[] {
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
				const [filepath, id] = attribs.href.split("#");
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
			items[items.length - 1].text = text;
		},
	});

	parser.write(nav);
	parser.end();
	console.log(`Navigator parsed in ${Date.now() - starttime}ms`);

	return items;
}

function parseBodyContent(
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
		while (cursor < len && /\s/.test(cssText[cursor])) cursor++;

		// start of selector
		const selectorStart = cursor;
		while (cursor < len && cssText[cursor] !== "{") cursor++;
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
