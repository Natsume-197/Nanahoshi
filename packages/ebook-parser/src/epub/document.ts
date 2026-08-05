import { XMLParser } from "fast-xml-parser";
import type {
	EbookDocument,
	EbookFormat,
	EbookIdentifier,
	EbookMetadata,
	EbookPresentation,
	HtmlNavigationItem,
	HtmlNavigationTarget,
} from "../ebook";
import type { ZipArchive } from "../zip/archive";
import { dirname, joinPath, normalizePath } from "./paths";

type XmlNode = Record<string, unknown>;

interface ManifestItem {
	id: string;
	href: string;
	mediaType: string;
	properties: string[];
	fallback?: string;
	path: string;
}

interface SpineItem {
	id: string;
	path: string;
}

const parser = new XMLParser({
	ignoreAttributes: false,
	removeNSPrefix: true,
	parseTagValue: false,
	trimValues: false,
});

export async function openEpubArchive(
	archive: ZipArchive,
	format: Extract<EbookFormat, "epub" | "kepub"> = "epub",
): Promise<EbookDocument> {
	try {
		await rejectEncryptedContent(archive, format);
		const containerXml = await archive.text("META-INF/container.xml");
		if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");
		const container = parser.parse(containerXml) as XmlNode;
		const rootfiles = asArray(
			pathValue(container, "container", "rootfiles", "rootfile"),
		);
		const rootfile = objectValue(rootfiles[0]);
		const opfPath = stringAttribute(rootfile, "full-path");
		if (!opfPath) throw new Error("Invalid EPUB: container has no rootfile");

		const opfXml = await archive.text(opfPath);
		if (!opfXml) throw new Error(`Invalid EPUB: missing ${opfPath}`);
		const document = parser.parse(opfXml) as XmlNode;
		const pkg = objectValue(document.package);
		if (!pkg) throw new Error("Invalid EPUB: missing package element");
		const metadataNode = objectValue(pkg.metadata);
		if (!metadataNode) throw new Error("Invalid EPUB: missing metadata");

		const opfDirectory = dirname(opfPath);
		const manifest = readManifest(pkg, opfDirectory, archive);
		const manifestById = new Map(manifest.map((item) => [item.id, item]));
		const manifestByPath = new Map(manifest.map((item) => [item.path, item]));
		const spine = readSpine(pkg, manifestById);
		const sectionIdByPath = new Map(spine.map((item) => [item.path, item.id]));
		const metadata = readMetadata(pkg, metadataNode);
		const toc = await readToc(archive, pkg, manifest, sectionIdByPath);
		const cssItems = manifest.filter((item) => item.mediaType === "text/css");
		let stylesPromise: Promise<string[]> | undefined;

		const archivePathFor = (basePath: string, href: string): string | null => {
			const bare = href.split(/[?#]/, 1)[0];
			if (!bare || isExternalHref(bare)) return null;
			const candidates = [
				joinPath(dirname(basePath), bare),
				normalizePath(bare),
			].flatMap((candidate) => {
				const decoded = safeDecode(candidate);
				return decoded === candidate ? [candidate] : [candidate, decoded];
			});
			return candidates.find((candidate) => archive.has(candidate)) ?? null;
		};

		const resourceHref = (basePath: string, href: string): string | null => {
			const path = archivePathFor(basePath, href);
			return path ? `ebook-resource:${encodeURIComponent(path)}` : null;
		};

		const sectionHref = (basePath: string, href: string): string | null => {
			const [file = "", fragment] = href.split("#", 2);
			const path = file ? archivePathFor(basePath, file) : basePath;
			const sectionId = path ? sectionIdByPath.get(path) : undefined;
			if (!sectionId) return null;
			return `ebook-section:${encodeURIComponent(sectionId)}${
				fragment ? `#${fragment}` : ""
			}`;
		};

		const rewriteCss = (css: string, cssPath: string) =>
			css.replace(
				/url\(\s*(["']?)(.*?)\1\s*\)/gi,
				(match, quote: string, href: string) => {
					const replacement = resourceHref(cssPath, href);
					return replacement ? `url(${quote}${replacement}${quote})` : match;
				},
			);

		const loadStyles = () => {
			stylesPromise ??= Promise.all(
				cssItems.map(async (item) =>
					rewriteCss((await archive.text(item.path)) ?? "", item.path),
				),
			);
			return stylesPromise;
		};

		const coverItem = findCoverItem(pkg, manifest, manifestById);

		return {
			format,
			metadata,
			content: {
				kind: "html",
				sections: spine.map(({ id }) => ({ id })),
				toc,
				async openSection(id) {
					const item = spine.find((candidate) => candidate.id === id);
					if (!item) return undefined;
					const source = await archive.text(item.path);
					if (source === undefined) return undefined;
					const head =
						source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
					const bodyMatch = source.match(/<body\b([^>]*)>([\s\S]*?)<\/body>/i);
					const htmlMatch = source.match(/<html\b([^>]*)>/i);
					const bodyAttributes = bodyMatch?.[1] ?? "";
					const inlineStyles = [
						...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi),
					].map((match) => rewriteCss(match[1] ?? "", item.path));
					return {
						html: rewriteHtml(
							bodyMatch?.[2] ?? source,
							item.path,
							sectionHref,
							resourceHref,
							rewriteCss,
						),
						styles: [...(await loadStyles()), ...inlineStyles],
						htmlClass: attributeValue(htmlMatch?.[1] ?? "", "class"),
						bodyClass: attributeValue(bodyAttributes, "class"),
						bodyId: attributeValue(bodyAttributes, "id"),
					};
				},
				async openResource(href) {
					const path = epubResourcePath(href);
					if (!path || !archive.has(path)) return undefined;
					const data = await archive.bytes(path);
					if (!data) return undefined;
					return {
						data,
						mediaType:
							manifestByPath.get(path)?.mediaType ?? mediaTypeFromPath(path),
					};
				},
			},
			async openCover() {
				if (!coverItem) return undefined;
				let coverPath = coverItem.path;
				let mediaType = coverItem.mediaType;
				if (mediaType === "image/svg+xml") {
					const svg = await archive.text(coverPath);
					const embedded = svg?.match(
						/<image[^>]+(?:href|xlink:href)\s*=\s*["']([^"']+)["']/i,
					)?.[1];
					const path = embedded ? archivePathFor(coverPath, embedded) : null;
					if (path) {
						coverPath = path;
						mediaType =
							manifestByPath.get(path)?.mediaType ?? mediaTypeFromPath(path);
					}
				}
				const data = await archive.bytes(coverPath);
				return data ? { data, mediaType } : undefined;
			},
			close: () => archive.close(),
		};
	} catch (error) {
		await archive.close();
		throw error;
	}
}

async function rejectEncryptedContent(
	archive: ZipArchive,
	format: Extract<EbookFormat, "epub" | "kepub">,
) {
	if (!archive.has("META-INF/encryption.xml")) return;
	const xml = await archive.text("META-INF/encryption.xml");
	if (!xml) return;
	const algorithms = [
		...xml.matchAll(/<EncryptionMethod\b[^>]*\bAlgorithm\s*=\s*["']([^"']+)/gi),
	]
		.map((match) => match[1] ?? "")
		.filter(Boolean);
	const fontObfuscation =
		/(?:idpf\.org\/2008\/embedding|adobe\.com\/pdf\/enc#RC)$/i;
	if (
		!algorithms.length ||
		algorithms.some((algorithm) => !fontObfuscation.test(algorithm))
	) {
		throw new Error(
			`Encrypted ${format.toUpperCase()} files are not supported`,
		);
	}
}

function readManifest(
	pkg: XmlNode,
	opfDirectory: string,
	archive: ZipArchive,
): ManifestItem[] {
	const nodes = asArray(objectValue(pkg.manifest)?.item);
	return nodes.flatMap((value) => {
		const node = objectValue(value);
		const id = stringAttribute(node, "id");
		const href = stringAttribute(node, "href");
		if (!node || !id || !href) return [];
		const path = resolveManifestPath(opfDirectory, href, archive);
		return [
			{
				id,
				href,
				path,
				mediaType: stringAttribute(node, "media-type") ?? "",
				properties: (stringAttribute(node, "properties") ?? "")
					.split(/\s+/)
					.filter(Boolean),
				fallback: stringAttribute(node, "fallback"),
			},
		];
	});
}

function readSpine(
	pkg: XmlNode,
	manifestById: Map<string, ManifestItem>,
): SpineItem[] {
	return asArray(objectValue(pkg.spine)?.itemref).flatMap((value) => {
		const node = objectValue(value);
		if (stringAttribute(node, "linear")?.toLowerCase() === "no") return [];
		const idref = stringAttribute(node, "idref");
		const item = idref ? manifestById.get(idref) : undefined;
		return item && /(?:xhtml|html)/i.test(item.mediaType)
			? [{ id: idref as string, path: item.path }]
			: [];
	});
}

function readMetadata(pkg: XmlNode, metadata: XmlNode): EbookMetadata {
	const identifiers: EbookIdentifier[] = asArray(metadata.identifier)
		.map((value) => {
			const node = objectValue(value);
			return {
				value: textValue(value),
				id: stringAttribute(node, "id"),
				scheme:
					stringAttribute(node, "scheme") ??
					stringAttribute(node, "opf:scheme"),
			};
		})
		.filter((value) => value.value.length > 0);
	const uniqueId = stringAttribute(pkg, "unique-identifier");
	const identifier =
		identifiers.find((value) => value.id === uniqueId)?.value ??
		identifiers[0]?.value ??
		"";

	return {
		identifier,
		identifiers,
		title: firstText(metadata.title),
		subtitle: firstText(metadata.subtitle),
		authors: textArray(metadata.creator ?? metadata.author),
		publisher: firstText(metadata.publisher),
		language: normalizeLanguage(firstText(metadata.language)),
		published: firstText(metadata.date),
		description: firstText(metadata.description),
		subjects: textArray(metadata.subject),
		rights: firstText(metadata.rights),
		contributors: textArray(metadata.contributor),
		presentation: readPresentation(pkg, metadata),
	};
}

function readPresentation(pkg: XmlNode, metadata: XmlNode): EbookPresentation {
	const progression = stringAttribute(
		objectValue(pkg.spine),
		"page-progression-direction",
	)?.toLowerCase();
	const presentation: EbookPresentation = {
		layout: null,
		spread: null,
		declaresPageResolution: false,
		pageProgressionDirection:
			progression === "ltr" ||
			progression === "rtl" ||
			progression === "default"
				? progression
				: null,
	};
	for (const value of asArray(metadata.meta)) {
		const node = objectValue(value);
		const property = stringAttribute(node, "property");
		if (property === "rendition:layout") presentation.layout = textValue(value);
		if (property === "rendition:spread") presentation.spread = textValue(value);
		if (
			stringAttribute(node, "name") === "original-resolution" ||
			property === "fixed-layout-jp:viewport"
		) {
			presentation.declaresPageResolution = true;
		}
	}
	return presentation;
}

async function readToc(
	archive: ZipArchive,
	pkg: XmlNode,
	manifest: ManifestItem[],
	sectionIdByPath: Map<string, string>,
): Promise<HtmlNavigationItem[]> {
	const nav = manifest.find((item) => item.properties.includes("nav"));
	if (nav) {
		const source = await archive.text(nav.path);
		if (source) {
			const items = [
				...source.matchAll(
					/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
				),
			]
				.map((match) => ({
					label: decodeXmlText((match[2] ?? "").replace(/<[^>]+>/g, " ")),
					target: navigationTarget(
						nav.path,
						match[1] ?? "",
						archive,
						sectionIdByPath,
					),
				}))
				.filter((item) => item.label.length > 0);
			if (items.length) return items;
		}
	}

	const spine = objectValue(pkg.spine);
	const ncxId = stringAttribute(spine, "toc");
	const ncx =
		manifest.find((item) => item.id === ncxId) ??
		manifest.find((item) => item.mediaType === "application/x-dtbncx+xml");
	if (!ncx) return [];
	const source = await archive.text(ncx.path);
	if (!source) return [];
	const document = parser.parse(source) as XmlNode;
	const points = asArray(pathValue(document, "ncx", "navMap", "navPoint"));
	return points.flatMap((point) =>
		readNcxPoint(point, ncx.path, archive, sectionIdByPath),
	);
}

function readNcxPoint(
	value: unknown,
	basePath: string,
	archive: ZipArchive,
	sectionIdByPath: Map<string, string>,
): HtmlNavigationItem[] {
	const point = objectValue(value);
	if (!point) return [];
	const href = stringAttribute(objectValue(point.content), "src") ?? "";
	const item: HtmlNavigationItem = {
		label: firstText(objectValue(point.navLabel)?.text),
		target: navigationTarget(basePath, href, archive, sectionIdByPath),
		children: asArray(point.navPoint).flatMap((child) =>
			readNcxPoint(child, basePath, archive, sectionIdByPath),
		),
	};
	return item.label ? [item] : (item.children ?? []);
}

function navigationTarget(
	basePath: string,
	href: string,
	archive: ZipArchive,
	sectionIdByPath: Map<string, string>,
): HtmlNavigationTarget | undefined {
	const [file = "", fragment] = href.split("#", 2);
	const candidates = file
		? [joinPath(dirname(basePath), file), normalizePath(file)]
		: [basePath];
	const path = candidates
		.flatMap((candidate) => [candidate, safeDecode(candidate)])
		.find((candidate) => archive.has(candidate));
	const sectionId = path ? sectionIdByPath.get(path) : undefined;
	return sectionId
		? { sectionId, selector: fragment ? `#${fragment}` : undefined }
		: undefined;
}

function findCoverItem(
	pkg: XmlNode,
	manifest: ManifestItem[],
	manifestById: Map<string, ManifestItem>,
): ManifestItem | undefined {
	const explicit = manifest.find((item) =>
		item.properties.includes("cover-image"),
	);
	if (explicit) return explicit;
	const metadata = objectValue(pkg.metadata);
	for (const value of asArray(metadata?.meta)) {
		const node = objectValue(value);
		if (stringAttribute(node, "name") === "cover") {
			const id = stringAttribute(node, "content");
			if (id && manifestById.has(id)) return manifestById.get(id);
		}
	}
	return manifest.find(
		(item) =>
			item.mediaType.startsWith("image/") &&
			(item.id.toLowerCase().includes("cover") ||
				item.properties.some((property) => property.includes("cover"))),
	);
}

function rewriteHtml(
	html: string,
	basePath: string,
	sectionHref: (basePath: string, href: string) => string | null,
	resourceHref: (basePath: string, href: string) => string | null,
	rewriteCss: (css: string, basePath: string) => string,
): string {
	return html.replace(/<[^>]+>/g, (tag) => {
		const tagName = tag.match(/^<\/?\s*([\w:-]+)/)?.[1]?.toLowerCase();
		if (!tagName || tag.startsWith("</")) return tag;
		let output = tag.replace(
			/\s(href|src|poster|xlink:href)\s*=\s*(["'])(.*?)\2/gi,
			(match, attribute: string, quote: string, href: string) => {
				const internal =
					attribute.toLowerCase() === "href" && tagName === "a"
						? sectionHref(basePath, href)
						: null;
				const replacement = internal ?? resourceHref(basePath, href);
				return replacement
					? ` ${attribute}=${quote}${replacement}${quote}`
					: match;
			},
		);
		output = output.replace(
			/\sstyle\s*=\s*(["'])(.*?)\1/gi,
			(_match, quote: string, css: string) =>
				` style=${quote}${rewriteCss(css, basePath)}${quote}`,
		);
		return output;
	});
}

function resolveManifestPath(
	baseDirectory: string,
	href: string,
	archive: ZipArchive,
): string {
	const bare = href.split(/[?#]/, 1)[0] ?? href;
	const joined =
		baseDirectory === "." ? normalizePath(bare) : joinPath(baseDirectory, bare);
	for (const candidate of [
		joined,
		safeDecode(joined),
		normalizePath(bare),
		safeDecode(normalizePath(bare)),
	]) {
		if (archive.has(candidate)) return candidate;
	}
	return joined;
}

function epubResourcePath(href: string): string | null {
	if (!href.startsWith("ebook-resource:")) return null;
	const encoded = href.slice("ebook-resource:".length).split("?", 1)[0];
	return encoded ? safeDecode(encoded) : null;
}

function isExternalHref(href: string): boolean {
	return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href);
}

function normalizeLanguage(value: string): string {
	const subtags = value
		.trim()
		.split(/[-_]/)
		.filter((part) => part && part.toLowerCase() !== "undefined");
	const primary = subtags[0]?.toLowerCase() ?? "";
	if (!/^[a-z]{2,8}$/.test(primary)) return "";
	const normalized = [primary, ...subtags.slice(1)].join("-");
	return normalized.length <= 8 ? normalized : primary;
}

function mediaTypeFromPath(path: string): string {
	const extension = path.split(".").pop()?.toLowerCase();
	return (
		{
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			png: "image/png",
			gif: "image/gif",
			webp: "image/webp",
			svg: "image/svg+xml",
			woff: "font/woff",
			woff2: "font/woff2",
			ttf: "font/ttf",
			otf: "font/otf",
			mp3: "audio/mpeg",
			mp4: "video/mp4",
		}[extension ?? ""] ?? "application/octet-stream"
	);
}

function pathValue(root: unknown, ...path: string[]): unknown {
	let current = root;
	for (const key of path) current = objectValue(current)?.[key];
	return current;
}

function objectValue(value: unknown): XmlNode | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as XmlNode)
		: undefined;
}

function asArray(value: unknown): unknown[] {
	return value === undefined || value === null
		? []
		: Array.isArray(value)
			? value
			: [value];
}

function stringAttribute(
	node: XmlNode | undefined,
	name: string,
): string | undefined {
	const value = node?.[`@_${name}`];
	return typeof value === "string" || typeof value === "number"
		? String(value)
		: undefined;
}

function firstText(value: unknown): string {
	return textValue(asArray(value)[0]);
}

function textArray(value: unknown): string[] {
	return asArray(value).map(textValue).filter(Boolean);
}

function textValue(value: unknown): string {
	if (typeof value === "string" || typeof value === "number") {
		return String(value).trim();
	}
	if (Array.isArray(value)) return value.map(textValue).join(" ").trim();
	const node = objectValue(value);
	if (!node) return "";
	if (node["#text"] !== undefined) return textValue(node["#text"]);
	return Object.entries(node)
		.filter(([key]) => !key.startsWith("@_"))
		.map(([, child]) => textValue(child))
		.join(" ")
		.trim();
}

function attributeValue(attributes: string, name: string): string | undefined {
	const match = attributes.match(
		new RegExp(`\\s${name}\\s*=\\s*(?:(["'])(.*?)\\1|([^\\s>]+))`, "i"),
	);
	return match?.[2] ?? match?.[3];
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function decodeXmlText(value: string): string {
	return value
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}
