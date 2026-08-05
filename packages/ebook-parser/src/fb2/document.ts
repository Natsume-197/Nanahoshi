import { XMLParser } from "fast-xml-parser";
import type {
	EbookDocument,
	EbookIdentifier,
	EbookMetadata,
	HtmlNavigationItem,
} from "../ebook";

type XmlNode = Record<string, unknown>;

interface SectionRecord {
	id: string;
	nodes: XmlNode[];
	root?: XmlNode;
	bodyName?: string;
}

interface LinkTarget {
	sectionId: string;
	htmlId: string;
}

interface RenderContext {
	binaries: Map<string, BinaryResource>;
	htmlIdByNode: WeakMap<XmlNode, string>;
	links: Map<string, LinkTarget>;
}

interface BinaryResource {
	encoded: string;
	mediaType: string;
	data?: Uint8Array;
}

const parser = new XMLParser({
	ignoreAttributes: false,
	removeNSPrefix: true,
	parseTagValue: false,
	trimValues: false,
	preserveOrder: true,
});

const FB2_STYLES = `
.fb2-title { text-align: center; margin-block: 1.5em 1em; }
.fb2-title p { text-indent: 0; }
.fb2-epigraph, .fb2-cite { margin-inline: 8%; }
.fb2-poem { margin-block: 1em; }
.fb2-stanza { margin-block: .75em; }
.fb2-verse { margin-block: 0; text-indent: 0; }
.fb2-text-author { text-align: end; text-indent: 0; }
.fb2-subtitle { text-align: center; }
`.trim();

const WINDOWS_1251_HIGH =
	"ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—\u0098™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬\u00ad®Ї°±Ііґµ¶·ё№є»јЅѕїАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя";

export function parseFb2Document(
	input: ArrayBuffer | Uint8Array,
): EbookDocument {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	const xml = decodeXml(bytes);
	if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
		throw new Error("FB2 documents with DTD declarations are not supported");
	}
	const parsed = parser.parse(xml);
	if (!Array.isArray(parsed)) throw new Error("Invalid FB2 document");
	const root = findElement(parsed as XmlNode[], "FictionBook");
	if (!root) throw new Error("Invalid FB2: missing FictionBook root");

	const description = firstChild(root, "description");
	const titleInfo = description
		? firstChild(description, "title-info")
		: undefined;
	const documentInfo = description
		? firstChild(description, "document-info")
		: undefined;
	const publishInfo = description
		? firstChild(description, "publish-info")
		: undefined;
	const binaries = readBinaries(root);
	const bodies = childElements(root, "body");
	const sections = buildSections(bodies);
	if (!sections.length) throw new Error("Invalid FB2: missing readable body");

	const links = new Map<string, LinkTarget>();
	const htmlIdByNode = new WeakMap<XmlNode, string>();
	indexLinks(sections, links, htmlIdByNode);
	const context: RenderContext = { binaries, htmlIdByNode, links };
	const coverId = coverResourceId(titleInfo);

	return {
		format: "fb2",
		metadata: readMetadata(titleInfo, documentInfo, publishInfo),
		content: {
			kind: "html",
			sections: sections.map(({ id }) => ({ id })),
			toc: buildToc(sections, htmlIdByNode),
			async openSection(id) {
				const section = sections.find((candidate) => candidate.id === id);
				return section
					? {
							html: renderNodes(section.nodes, context),
							styles: [FB2_STYLES],
						}
					: undefined;
			},
			async openResource(href) {
				const id = resourceId(href);
				return id ? openBinary(binaries.get(id)) : undefined;
			},
		},
		async openCover() {
			return coverId ? openBinary(binaries.get(coverId)) : undefined;
		},
		async close() {},
	};
}

function readMetadata(
	titleInfo?: XmlNode,
	documentInfo?: XmlNode,
	publishInfo?: XmlNode,
): EbookMetadata {
	const documentId = childText(documentInfo, "id");
	const isbn = childText(publishInfo, "isbn");
	const identifiers: EbookIdentifier[] = [
		{ value: documentId, scheme: "FB2" },
		{ value: isbn, scheme: "ISBN" },
	].filter((entry) => entry.value.length > 0);
	const date = titleInfo ? firstChild(titleInfo, "date") : undefined;
	const dateValue = date ? attribute(date, "value") : "";
	const keywords = childText(titleInfo, "keywords")
		.split(/[;,]/)
		.map((value) => value.trim())
		.filter(Boolean);
	const genres = childElements(titleInfo, "genre")
		.map(textContent)
		.map(normalizeWhitespace)
		.filter(Boolean);
	const annotation = titleInfo
		? firstChild(titleInfo, "annotation")
		: undefined;

	return {
		identifier: documentId || isbn,
		identifiers,
		title: childText(titleInfo, "book-title"),
		subtitle: "",
		authors: childElements(titleInfo, "author").map(personName).filter(Boolean),
		publisher: childText(publishInfo, "publisher"),
		language: childText(titleInfo, "lang"),
		published:
			dateValue ||
			(date ? normalizeWhitespace(textContent(date)) : "") ||
			childText(publishInfo, "year"),
		description: annotation ? normalizeWhitespace(textContent(annotation)) : "",
		subjects: [...new Set([...genres, ...keywords])],
		rights: "",
		contributors: childElements(titleInfo, "translator")
			.map(personName)
			.filter(Boolean),
	};
}

function personName(person: XmlNode): string {
	const parts = [
		childText(person, "first-name"),
		childText(person, "middle-name"),
		childText(person, "last-name"),
	].filter(Boolean);
	return parts.join(" ") || childText(person, "nickname");
}

function readBinaries(root: XmlNode): Map<string, BinaryResource> {
	const binaries = new Map<string, BinaryResource>();
	for (const binary of childElements(root, "binary")) {
		const id = attribute(binary, "id").trim();
		if (!id) continue;
		binaries.set(id, {
			encoded: textContent(binary),
			mediaType:
				attribute(binary, "content-type") || "application/octet-stream",
		});
	}
	return binaries;
}

function coverResourceId(titleInfo?: XmlNode): string | undefined {
	const coverpage = titleInfo ? firstChild(titleInfo, "coverpage") : undefined;
	const image = coverpage ? firstChild(coverpage, "image") : undefined;
	const href = image ? attribute(image, "href") : "";
	return href.startsWith("#") ? href.slice(1) : undefined;
}

function buildSections(bodies: XmlNode[]): SectionRecord[] {
	const records: SectionRecord[] = [];
	const used = new Set<string>();

	for (const [bodyIndex, body] of bodies.entries()) {
		const bodyNodes = nodeChildren(body);
		const bodySections: SectionRecord[] = [];
		let prefix: XmlNode[] = [];

		for (const node of bodyNodes) {
			if (elementName(node) === "section") {
				const preferred = attribute(node, "id");
				const id = uniqueId(preferred || `fb2-body-${bodyIndex + 1}`, used);
				const record = { id, nodes: [...prefix, node], root: node };
				prefix = [];
				bodySections.push(record);
				continue;
			}
			const current = bodySections.at(-1);
			if (current) current.nodes.push(node);
			else prefix.push(node);
		}

		if (!bodySections.length && prefix.some(hasMeaningfulContent)) {
			bodySections.push({
				id: uniqueId(`fb2-body-${bodyIndex + 1}`, used),
				nodes: prefix,
				bodyName: attribute(body, "name"),
			});
		}
		records.push(...bodySections);
	}
	return records;
}

function indexLinks(
	sections: SectionRecord[],
	links: Map<string, LinkTarget>,
	htmlIdByNode: WeakMap<XmlNode, string>,
) {
	const usedHtmlIds = new Set<string>();
	for (const section of sections) {
		for (const node of section.nodes) {
			walkElements(node, (element) => {
				const original = attribute(element, "id");
				const needsTocId = elementName(element) === "section";
				if (!original && !needsTocId) return;
				const htmlId = uniqueId(original || `${section.id}-part`, usedHtmlIds);
				htmlIdByNode.set(element, htmlId);
				if (original && !links.has(original)) {
					links.set(original, { sectionId: section.id, htmlId });
				}
			});
		}
	}
}

function buildToc(
	sections: SectionRecord[],
	htmlIdByNode: WeakMap<XmlNode, string>,
): HtmlNavigationItem[] {
	return sections.map((section, index) => {
		if (!section.root) {
			return {
				label: section.bodyName || `Section ${index + 1}`,
				target: { sectionId: section.id },
			};
		}
		return tocItem(section.root, section.id, htmlIdByNode, true, index + 1);
	});
}

function openBinary(
	resource: BinaryResource | undefined,
): { data: Uint8Array; mediaType: string } | undefined {
	if (!resource) return undefined;
	resource.data ??= decodeBase64(resource.encoded);
	return { data: resource.data, mediaType: resource.mediaType };
}

function tocItem(
	section: XmlNode,
	sectionId: string,
	htmlIdByNode: WeakMap<XmlNode, string>,
	isRoot: boolean,
	fallbackIndex: number,
): HtmlNavigationItem {
	const title = firstChild(section, "title");
	const children = childElements(section, "section").map((child, index) =>
		tocItem(child, sectionId, htmlIdByNode, false, index + 1),
	);
	const htmlId = htmlIdByNode.get(section);
	return {
		label:
			(title ? normalizeWhitespace(textContent(title)) : "") ||
			`Section ${fallbackIndex}`,
		target: {
			sectionId,
			selector: !isRoot && htmlId ? `#${htmlId}` : undefined,
		},
		children: children.length ? children : undefined,
	};
}

function renderNodes(nodes: XmlNode[], context: RenderContext): string {
	return nodes.map((node) => renderNode(node, context)).join("");
}

function renderNode(node: XmlNode, context: RenderContext): string {
	if (Object.hasOwn(node, "#text"))
		return escapeHtml(String(node["#text"] ?? ""));
	const name = elementName(node);
	if (!name || name.startsWith("?") || name.startsWith("#")) return "";
	const children = renderNodes(nodeChildren(node), context);
	const id = context.htmlIdByNode.get(node);
	const idAttribute = id ? ` id="${escapeAttribute(id)}"` : "";

	switch (name) {
		case "section":
			return `<section${idAttribute}>${children}</section>`;
		case "title":
			return `<header class="fb2-title"${idAttribute}>${children}</header>`;
		case "subtitle":
			return `<h3 class="fb2-subtitle"${idAttribute}>${children}</h3>`;
		case "p":
			return `<p${idAttribute}>${children}</p>`;
		case "empty-line":
			return "<br>";
		case "strong":
			return `<strong${idAttribute}>${children}</strong>`;
		case "emphasis":
			return `<em${idAttribute}>${children}</em>`;
		case "strikethrough":
			return `<s${idAttribute}>${children}</s>`;
		case "sub":
		case "sup":
		case "code":
			return `<${name}${idAttribute}>${children}</${name}>`;
		case "style": {
			const styleName = safeToken(attribute(node, "name"));
			const className = styleName
				? `fb2-style fb2-style-${styleName}`
				: "fb2-style";
			return `<span class="${className}"${idAttribute}>${children}</span>`;
		}
		case "a":
			return renderLink(node, children, idAttribute, context);
		case "image":
			return renderImage(node, idAttribute, context);
		case "epigraph":
		case "cite":
			return `<blockquote class="fb2-${name}"${idAttribute}>${children}</blockquote>`;
		case "poem":
		case "stanza":
			return `<div class="fb2-${name}"${idAttribute}>${children}</div>`;
		case "v":
			return `<p class="fb2-verse"${idAttribute}>${children}</p>`;
		case "text-author":
			return `<p class="fb2-text-author"${idAttribute}>${children}</p>`;
		case "date":
			return `<time${idAttribute}>${children}</time>`;
		case "annotation":
			return `<aside class="fb2-annotation"${idAttribute}>${children}</aside>`;
		case "table":
		case "tr":
			return `<${name}${idAttribute}>${children}</${name}>`;
		case "td":
		case "th":
			return renderTableCell(name, node, children, idAttribute);
		default:
			return `<div class="fb2-${safeToken(name)}"${idAttribute}>${children}</div>`;
	}
}

function renderLink(
	node: XmlNode,
	children: string,
	idAttribute: string,
	context: RenderContext,
): string {
	const href = attribute(node, "href");
	let normalized = href;
	if (href.startsWith("#")) {
		const target = context.links.get(href.slice(1));
		normalized = target
			? `ebook-section:${encodeURIComponent(target.sectionId)}#${target.htmlId}`
			: href;
	}
	const hrefAttribute = normalized
		? ` href="${escapeAttribute(normalized)}"`
		: "";
	return `<a${idAttribute}${hrefAttribute}>${children}</a>`;
}

function renderImage(
	node: XmlNode,
	idAttribute: string,
	context: RenderContext,
): string {
	const href = attribute(node, "href");
	const resource = href.startsWith("#") ? href.slice(1) : "";
	if (!resource || !context.binaries.has(resource)) return "";
	const alt = attribute(node, "alt") || attribute(node, "title");
	return `<img${idAttribute} src="ebook-resource:${encodeURIComponent(resource)}" alt="${escapeAttribute(alt)}">`;
}

function renderTableCell(
	name: "td" | "th",
	node: XmlNode,
	children: string,
	idAttribute: string,
): string {
	const attributes = ["colspan", "rowspan", "align"].flatMap((key) => {
		const value = attribute(node, key);
		return value ? [` ${key}="${escapeAttribute(value)}"`] : [];
	});
	return `<${name}${idAttribute}${attributes.join("")}>${children}</${name}>`;
}

function resourceId(href: string): string | undefined {
	const prefix = "ebook-resource:";
	if (!href.startsWith(prefix)) return undefined;
	try {
		return decodeURIComponent(
			href.slice(prefix.length).split(/[?#]/, 1)[0] ?? "",
		);
	} catch {
		return undefined;
	}
}

function findElement(nodes: XmlNode[], name: string): XmlNode | undefined {
	return nodes.find((node) => elementName(node) === name);
}

function firstChild(node: XmlNode, name: string): XmlNode | undefined {
	return findElement(nodeChildren(node), name);
}

function childElements(node: XmlNode | undefined, name: string): XmlNode[] {
	return node
		? nodeChildren(node).filter((child) => elementName(child) === name)
		: [];
}

function childText(node: XmlNode | undefined, name: string): string {
	const child = node ? firstChild(node, name) : undefined;
	return child ? normalizeWhitespace(textContent(child)) : "";
}

function nodeChildren(node: XmlNode): XmlNode[] {
	const name = elementName(node);
	const value = name ? node[name] : undefined;
	return Array.isArray(value) ? (value as XmlNode[]) : [];
}

function elementName(node: XmlNode): string | undefined {
	return Object.keys(node).find((key) => key !== ":@");
}

function attribute(node: XmlNode, name: string): string {
	const attributes = node[":@"];
	if (!attributes || typeof attributes !== "object") return "";
	const value = (attributes as Record<string, unknown>)[`@_${name}`];
	return value === undefined || value === null ? "" : String(value);
}

function textContent(node: XmlNode): string {
	if (Object.hasOwn(node, "#text")) return String(node["#text"] ?? "");
	return nodeChildren(node).map(textContent).join("");
}

function walkElements(node: XmlNode, visit: (node: XmlNode) => void) {
	const name = elementName(node);
	if (!name || name.startsWith("#") || name.startsWith("?")) return;
	visit(node);
	for (const child of nodeChildren(node)) walkElements(child, visit);
}

function hasMeaningfulContent(node: XmlNode): boolean {
	return elementName(node) !== "#text" || textContent(node).trim().length > 0;
}

function uniqueId(value: string, used: Set<string>): string {
	const base = safeToken(value) || "fb2-section";
	let candidate = base;
	let suffix = 2;
	while (used.has(candidate)) candidate = `${base}-${suffix++}`;
	used.add(candidate);
	return candidate;
}

function safeToken(value: string): string {
	return value
		.trim()
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
	return escapeHtml(value).replaceAll('"', "&quot;");
}

function decodeXml(bytes: Uint8Array): string {
	let encoding = "utf-8";
	if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
	else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
	else {
		const head = new TextDecoder("windows-1252")
			.decode(bytes.subarray(0, Math.min(bytes.length, 512)))
			.replaceAll("\0", "");
		encoding =
			head.match(/<\?xml[^>]*encoding=["']\s*([^"']+)/i)?.[1] ?? encoding;
	}
	const normalized = encoding.trim().toLowerCase().replaceAll("_", "-");
	try {
		return new TextDecoder(
			normalized as ConstructorParameters<typeof TextDecoder>[0],
		).decode(bytes);
	} catch {
		if (
			["windows-1251", "windows1251", "cp1251", "cp-1251"].includes(normalized)
		) {
			return decodeWindows1251(bytes);
		}
		throw new Error(`Unsupported FB2 XML encoding: ${encoding}`);
	}
}

function decodeWindows1251(bytes: Uint8Array): string {
	const chunkSize = 16_384;
	let output = "";
	for (let start = 0; start < bytes.length; start += chunkSize) {
		const length = Math.min(chunkSize, bytes.length - start);
		const characters = new Uint16Array(length);
		for (let index = 0; index < length; index++) {
			const byte = bytes[start + index] ?? 0;
			characters[index] =
				byte < 0x80
					? byte
					: (WINDOWS_1251_HIGH.charCodeAt(byte - 0x80) ?? 0xfffd);
		}
		output += String.fromCharCode(...characters);
	}
	return output;
}

function decodeBase64(value: string): Uint8Array {
	const input = value.replace(/\s+/g, "");
	if (!input) return new Uint8Array();
	if (input.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(input)) {
		throw new Error("Invalid base64 resource in FB2");
	}
	const alphabet =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	const padding = input.endsWith("==") ? 2 : input.endsWith("=") ? 1 : 0;
	const output = new Uint8Array(Math.floor((input.length * 3) / 4) - padding);
	let offset = 0;
	for (let index = 0; index < input.length; index += 4) {
		const a = alphabet.indexOf(input[index] ?? "");
		const b = alphabet.indexOf(input[index + 1] ?? "");
		const c =
			input[index + 2] === "=" ? 0 : alphabet.indexOf(input[index + 2] ?? "");
		const d =
			input[index + 3] === "=" ? 0 : alphabet.indexOf(input[index + 3] ?? "");
		if (a < 0 || b < 0 || c < 0 || d < 0) {
			throw new Error("Invalid base64 resource in FB2");
		}
		const block = (a << 18) | (b << 12) | (c << 6) | d;
		if (offset < output.length) output[offset++] = (block >> 16) & 0xff;
		if (offset < output.length) output[offset++] = (block >> 8) & 0xff;
		if (offset < output.length) output[offset++] = block & 0xff;
	}
	return output;
}
