import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { Parser } from "htmlparser2";
import StreamZip from "node-stream-zip";
import { acquireCover } from "../../../../lib/cover-store";
import { logger } from "../../../../lib/logger";
import {
	type ContentForm,
	type ContentFormDeclaration,
	contentFormFromDeclaration,
	contentFormTextBudget,
	resolveContentForm,
} from "../../../../modules/catalogContentForm";
import {
	isUsableEmbeddedUid,
	isValidAsin,
	isValidIsbn10,
	isValidIsbn13,
	normalizeAsin,
	normalizeEmbeddedUid,
	normalizeIsbn,
} from "../../../../modules/identifiers";
import { LibraryRepository } from "../../../libraries/library.repository";
import { bookRepository } from "../../book.repository";
import type { Author, BookMetadata, Publisher } from "../book.metadata.model";

const log = logger.child({ component: "local-provider" });

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
	asin: string | null;
	isbn10: string | null;
	isbn13: string | null;
	embeddedUid: string | null;
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
	contentForm: ContentForm = "text";

	subtitle: string | null = null;
	description: string | null = null;
	publisher: string | null = null;
	date: string | undefined = undefined;
	asin: string | null = null;
	isbn10: string | null = null;
	isbn13: string | null = null;
	embeddedUid: string | null = null;

	images: SourceImage[] = [];
	cover: string | null = null;
}

export class LocalProvider {
	private libraryRepository = new LibraryRepository();

	async getMetadata(
		input: Partial<BookMetadata> & {
			bookId?: number;
			uuid: string;
			filePath?: string;
		},
	): Promise<Partial<BookMetadata>> {
		if (!input.bookId) return {};

		// Callers that know the path pass it in to skip a per-book DB lookup.
		const filePath =
			input.filePath ?? (await this.getBookFilePath(input.bookId));

		if (!filePath) {
			log.error(
				{ bookId: input.bookId },
				"No se encontró el archivo para bookId",
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
			log.warn(
				{ err: error, bookId: input.bookId },
				"No se pudo extraer metadata del EPUB",
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
			isbn10: book.isbn10,
			isbn13: book.isbn13,
			asin: book.asin,
			embeddedUid: book.embeddedUid,
			cover: book.cover || undefined,
			amountChars: book.totalChars || null,
			contentForm: book.contentForm,
			publisher: publisher || undefined,
		};
	}

	private async getBookFilePath(bookId: number): Promise<string | null> {
		const book = await bookRepository.getById(bookId);
		if (!book?.relativePath || !book.libraryPathId || !book.libraryId) {
			return null;
		}

		const paths = await this.libraryRepository.findPathsByLibraryId(
			book.libraryId,
		);
		if (!paths?.length) return null;

		const libraryPath = paths.find((p) => p.id === book.libraryPathId);
		if (!libraryPath) return null;

		const normalizedRelative = path.normalize(book.relativePath);
		return path.join(libraryPath.path, normalizedRelative);
	}
}

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
		epubBook.asin = metadata.asin;
		epubBook.isbn10 = metadata.isbn10;
		epubBook.isbn13 = metadata.isbn13;
		epubBook.embeddedUid = metadata.embeddedUid;

		epubBook.contentForm = await extractContentForm(
			zip,
			pkgDocumentXml,
			basePath,
		);

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
		asin: null,
		isbn10: null,
		isbn13: null,
		embeddedUid: null,
	};

	// identifier. According to the specs, there can be more than one id
	const ids = getDcMetadataField(metadataNode, "identifier");
	if (ids) {
		metadata.identifier = String(extractId(ids));
		const uniqueIdRef = (
			pkgDocument.package as unknown as Record<string, unknown>
		)["@_unique-identifier"];
		const embedded = extractEmbeddedIdentifiers(
			ids,
			typeof uniqueIdRef === "string" ? uniqueIdRef : undefined,
		);
		metadata.asin = embedded.asin;
		metadata.isbn10 = embedded.isbn10;
		metadata.isbn13 = embedded.isbn13;
		metadata.embeddedUid = embedded.embeddedUid;
	}

	const titles = getDcMetadataField(metadataNode, "title");
	metadata.title = extractText(titles) ?? "";

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

export async function extractCover(
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
	// Heuristic fallback: id/properties merely mention "cover". This is fuzzy
	// (e.g. "allcover-001" matches too), so it is only used as a last resort.
	let heuristicRasterHref: string | null = null;
	let heuristicSvgHref: string | null = null;
	// EPUB 3 authoritative signal: properties="cover-image".
	let epub3CoverItem: (typeof arr)[number] | undefined;

	for (const item of arr) {
		if (!item || typeof item !== "object") continue;

		const id = (item["@_id"] as string) ?? "";
		if (id) itemById.set(id, item);

		const type = item["@_media-type"] as string | undefined;
		const href = item["@_href"] as string | undefined;
		const props = (item["@_properties"] as string)?.toLowerCase() ?? "";

		if (!type?.startsWith("image/") || !href) continue;

		// EPUB 3: the cover is explicitly tagged with properties="cover-image".
		if (props.split(/\s+/).includes("cover-image")) {
			epub3CoverItem ??= item;
			continue;
		}

		// Fuzzy id/props match kept only for the heuristic fallback.
		if (id.toLowerCase().includes("cover") || props.includes("cover")) {
			if (type === "image/svg+xml") {
				heuristicSvgHref ??= href;
			} else {
				heuristicRasterHref ??= href;
			}
		}
	}

	// Resolve the cover by priority: EPUB3 cover-image, then EPUB2
	// <meta name="cover">, then fuzzy id/properties heuristic.
	let rasterCoverHref: string | null = null;
	let svgCoverHref: string | null = null;

	const assignFromItem = (item: (typeof arr)[number] | undefined) => {
		if (!item) return;
		const type = item["@_media-type"] as string | undefined;
		const href = item["@_href"] as string | undefined;
		if (!type?.startsWith("image/") || !href) return;
		if (type === "image/svg+xml") {
			svgCoverHref ??= href;
		} else {
			rasterCoverHref ??= href;
		}
	};

	// 1. EPUB 3
	assignFromItem(epub3CoverItem);

	// 2. EPUB 2: <meta name="cover" content="item-id">
	if (!rasterCoverHref && !svgCoverHref) {
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
				assignFromItem(refId ? itemById.get(refId) : undefined);
				break;
			}
		}
	}

	// 3. Fuzzy heuristic fallback
	if (!rasterCoverHref && !svgCoverHref) {
		rasterCoverHref = heuristicRasterHref;
		svgCoverHref = heuristicSvgHref;
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

	// Acquire only — the cover-ingest worker normalises it off the scan path.
	return await acquireCover(coverBuffer, bookId, path.extname(coverHref));
}

// Extracts the embedded raster image href from an SVG (EPUBs wrap covers in an
// SVG <image> element).
function extractImageHrefFromSvg(svg: string): string | null {
	const imageMatch = svg.match(
		/<image[^>]+(?:href|xlink:href)\s*=\s*["']([^"']+)["']/i,
	);
	return imageMatch?.[1] ?? null;
}

// Auxiliar functions to extract metadata

type EmbeddedIdentifiers = {
	asin: string | null;
	isbn10: string | null;
	isbn13: string | null;
	embeddedUid: string | null;
};

// Raw identifier text: fast-xml-parser may parse a numeric ISBN as a number.
function identifierValue(node: unknown): string | null {
	if (typeof node === "string") return node;
	if (typeof node === "number") return String(node);
	if (typeof node === "object" && node !== null && "#text" in node) {
		const text = (node as Record<string, unknown>)["#text"];
		if (typeof text === "string" || typeof text === "number")
			return String(text);
	}
	return null;
}

// Maps <dc:identifier> nodes to ASIN/ISBN fields so embedded ids drive
// duplicate grouping without waiting on external enrichment. ASINs and
// ISBN-13s are distinctive enough (strict format / checksum) to accept from
// any node; a bare 10-char string is only trusted as ISBN-10 when the scheme
// or a urn: prefix labels it. First valid value per field wins.
//
// Identifiers that are none of those may still be a stable publisher/store id
// (e.g. "3299511152"): the one referenced by the package's unique-identifier
// attribute (or the first usable one) lands in embeddedUid, an opaque
// same-edition grouping key that survives calibre re-packaging.
export function extractEmbeddedIdentifiers(
	ids: unknown,
	uniqueIdRef?: string,
): EmbeddedIdentifiers {
	const out: EmbeddedIdentifiers = {
		asin: null,
		isbn10: null,
		isbn13: null,
		embeddedUid: null,
	};
	const nodes = Array.isArray(ids) ? ids : [ids];
	let fallbackUid: string | null = null;

	for (const node of nodes) {
		const raw = identifierValue(node)?.trim();
		if (!raw) continue;

		const urnMatch = raw.match(/^urn:(isbn|asin):\s*(.+)$/i);
		const value = urnMatch?.[2] ?? raw;

		let scheme = urnMatch?.[1]?.toUpperCase() ?? "";
		let nodeId = "";
		if (typeof node === "object" && node !== null) {
			const attrs = node as Record<string, unknown>;
			// removeNSPrefix folds opf:scheme into @_scheme; keep the prefixed
			// form as a fallback for parsers configured without it.
			const rawScheme = attrs["@_scheme"] ?? attrs["@_opf:scheme"];
			if (!scheme && typeof rawScheme === "string")
				scheme = rawScheme.toUpperCase();
			if (typeof attrs["@_id"] === "string") nodeId = attrs["@_id"];
		}
		const labeled = /ISBN|ASIN|AMAZON/.test(scheme);

		if (isValidAsin(value)) {
			out.asin ??= normalizeAsin(value);
		} else if (isValidIsbn13(value)) {
			out.isbn13 ??= normalizeIsbn(value);
		} else if (labeled && isValidIsbn10(value)) {
			out.isbn10 ??= normalizeIsbn(value);
		} else if (isUsableEmbeddedUid(raw)) {
			const uid = normalizeEmbeddedUid(raw);
			if (uniqueIdRef && nodeId === uniqueIdRef) out.embeddedUid ??= uid;
			fallbackUid ??= uid;
		}
	}

	out.embeddedUid ??= fallbackUid;
	return out;
}

// EPUB identifier; prioritizes the uuid when there are multiple <dc:identifier>.
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

/**
 * Pages opened to tell page images from prose. Sampled across the spine rather
 * than taken from the front, because a novel opens on a cover, a colophon and
 * illustration plates that carry no prose and read exactly like a comic.
 */
const CONTENT_FORM_SAMPLE_DOCUMENTS = 12;
// One normal prose page usually settles the question alone. If it does not,
// the remaining sample is typically a page-image EPUB, where bounded parallel
// reads avoid serially inflating twelve large XHTML documents while keeping
// memory and random I/O under control.
const CONTENT_FORM_READ_CONCURRENCY = 4;

function packageNodes(
	pkgDocumentXml: unknown,
	pick: (pkg: NonNullable<XmlMetadataDocument["package"]>) => unknown,
): Record<string, unknown>[] {
	const pkg = (pkgDocumentXml as XmlMetadataDocument).package;
	const node = pkg ? pick(pkg) : undefined;
	if (!node) return [];
	return (Array.isArray(node) ? node : [node]).filter(
		(entry): entry is Record<string, unknown> =>
			!!entry && typeof entry === "object",
	);
}

function readContentFormDeclaration(
	pkgDocumentXml: unknown,
): ContentFormDeclaration {
	const declaration: ContentFormDeclaration = {
		layout: null,
		spread: null,
		declaresPageResolution: false,
	};
	for (const entry of packageNodes(
		pkgDocumentXml,
		(pkg) => (pkg.metadata as Record<string, unknown> | undefined)?.meta,
	)) {
		const property = entry["@_property"];
		if (property === "rendition:layout") {
			declaration.layout = getTextNodeValue(entry);
		} else if (property === "rendition:spread") {
			declaration.spread = getTextNodeValue(entry);
		}
		// Both mark a page-image package: the EBPAJ viewport and the page
		// resolution a comic reader needs to letterbox the artwork.
		if (
			entry["@_name"] === "original-resolution" ||
			property === "fixed-layout-jp:viewport"
		) {
			declaration.declaresPageResolution = true;
		}
	}
	return declaration;
}

function bodyTextLength(document: string): number {
	return document
		.replace(/<head[\s\S]*?<\/head>/gi, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/gu, "").length;
}

/**
 * Whether the book reads as prose or as a sequence of page images. The package
 * declaration answers for most files at no cost, since the OPF is already
 * parsed; only a package that stays silent is opened, and then just far enough
 * to settle the question.
 */
export async function extractContentForm(
	zip: ZipReader,
	pkgDocumentXml: unknown,
	basePath: string,
): Promise<ContentForm> {
	const declaration = readContentFormDeclaration(pkgDocumentXml);
	const declared = contentFormFromDeclaration(declaration);
	if (declared) return declared;

	const items = packageNodes(
		pkgDocumentXml,
		(pkg) => (pkg.manifest as Record<string, unknown> | undefined)?.item,
	);
	const documents = items.filter(
		(item) => item["@_media-type"] === "application/xhtml+xml",
	);
	const imageCount = items.filter((item) =>
		String(item["@_media-type"] ?? "").startsWith("image/"),
	).length;
	if (documents.length === 0) return "text";

	const planned = Math.min(CONTENT_FORM_SAMPLE_DOCUMENTS, documents.length);
	const budget = contentFormTextBudget(planned);
	const stride = documents.length / planned;
	let textLength = 0;
	let sampledDocuments = 0;
	const samplePaths = Array.from({ length: planned }, (_, index) => {
		const href = documents[Math.floor(index * stride)]?.["@_href"];
		return typeof href === "string" ? _getFilePath(basePath, href) : null;
	}).filter((samplePath): samplePath is string => samplePath !== null);

	for (let offset = 0; offset < samplePaths.length; ) {
		// Read the first page alone: ordinary prose stops here, preserving the
		// cheap fast path. Once it proves inconclusive, overlap a small batch of
		// independent ZIP entries rather than waiting on each decompression.
		const batchSize = offset === 0 ? 1 : CONTENT_FORM_READ_CONCURRENCY;
		const paths = samplePaths.slice(offset, offset + batchSize);
		const pages = await Promise.all(
			paths.map((samplePath) => zip.entryData(samplePath).catch(() => null)),
		);
		offset += paths.length;

		for (const data of pages) {
			if (!data) continue;
			sampledDocuments++;
			textLength += bodyTextLength(data.toString());
		}
		// Enough prose to settle it; the pages still unread cannot change that.
		if (textLength >= budget) return "text";
	}
	return resolveContentForm(declaration, {
		textLength,
		sampledDocuments,
		imageCount,
		documentCount: documents.length,
	});
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
	log.info({ durationMs: Date.now() - starttime }, "Navigator parsed");

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
