import { Parser } from "htmlparser2";

export function assert(
	condition: unknown,
	message = "Assertion failed",
): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

/**
 * Metadata extracted from the EPUB Package Document.
 */
export interface IEpubMetadata {
	identifier: string;
	title: string;
	language: string;
	creator: string[];
	date?: string;
}

/**
 * Manifest extracted from EPUB: navigation, XHTML content, images and CSS.
 */
export interface IEpubManifest {
	xhtml: { lastIndex: number; content: string; name: string }[];
	imgs: { filename: string; blob: Blob }[];
	css: string;
}

/**
 * Extracts the metadata from the OPF XML.
 */
export function extractMetadata(pkgDocumentXml: any): IEpubMetadata {
	const meta: IEpubMetadata = {
		identifier: "",
		title: "",
		language: "",
		creator: [],
		date: undefined,
	};
	const ids = pkgDocumentXml.package.metadata["dc:identifier"];
	if (!ids) throw new Error("dc:identifier not found in OPF");
	meta.identifier = extractId(ids);

	const titles = pkgDocumentXml.package.metadata["dc:title"];
	if (!titles) throw new Error("dc:title not found in OPF");
	meta.title = extractText(titles) || "";

	const langs = pkgDocumentXml.package.metadata["dc:language"];
	if (!langs) throw new Error("dc:language not found in OPF");
	meta.language = extractText(langs) || "";

	const creators = pkgDocumentXml.package.metadata["dc:creator"];
	if (creators) {
		const arr = Array.isArray(creators) ? creators : [creators];
		for (const c of arr) {
			meta.creator.push(typeof c === "string" ? c : c["#text"]);
		}
	}

	const date = pkgDocumentXml.package.metadata["dc:date"];
	if (date) {
		meta.date = typeof date === "string" ? date : date["#text"];
	}

	return meta;
}

// Helper: extract text from XML nodes
function extractText(el: any): string {
	if (Array.isArray(el)) return extractText(el[0]);
	if (typeof el === "string") return el;
	if (el && typeof el === "object" && "#text" in el) return el["#text"];
	assert(false, "Unable to extract text");
	return "";
}

// Helper: pick best identifier, preferring node with @_id === 'uuid_id'
function extractId(el: unknown): string {
	if (typeof el === "string") return el;
	if (el && typeof el === "object" && "#text" in (el as any)) {
		return (el as any)["#text"];
	}
	assert(Array.isArray(el), "Invalid dc:identifier format");
	let fallback = "";
	for (const node of el as any[]) {
		if (typeof node === "string") {
			fallback = node;
		} else if (node && typeof node === "object") {
			if ((node as any)["@_id"] === "uuid_id") return extractText(node);
			const text = extractText(node);
			if (text) fallback = text;
		}
	}
	return fallback;
}

// Count Japanese characters in a string
function getJapaneseCharacterCount(text: string): number {
	const re = /[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々〻]+/gu;
	const onlyJP = text.replace(re, "");
	return [...onlyJP].length;
}

// Parse XHTML <body> content, wrap in <div id="basename">
function parseBodyContent(
	filename: string,
	xhtml: string,
	initialId: number,
	initialChars: number,
): [string, number, number] {
	let id = initialId;
	let chars = initialChars;
	let insideBody = false;
	let insideP = 0;
	let insideRt = 0;
	const fragments: string[] = [];

	const parser = new Parser({
		onopentag(name, attribs) {
			if (name === "body") {
				insideBody = true;
				return;
			}
			if (!insideBody) return;
			if (name === "p") {
				insideP++;
				attribs.index = id.toString();
				attribs.charAcumm = chars.toString();
				id++;
			}
			if (name === "rt") insideRt++;
			const attrs = Object.entries(attribs)
				.map(([k, v]) => `${k}="${v}"`)
				.join(" ");
			fragments.push(`<${name}${attrs ? ` ${attrs}` : ""}>`);
		},
		ontext(text) {
			if (!insideBody) return;
			fragments.push(text);
			if (insideP > 0 && insideRt === 0) {
				chars += getJapaneseCharacterCount(text);
			}
		},
		onclosetag(name) {
			if (name === "body") {
				insideBody = false;
				return;
			}
			if (!insideBody) return;
			if (name === "p") insideP = Math.max(insideP - 1, 0);
			if (name === "rt") insideRt = Math.max(insideRt - 1, 0);
			fragments.push(`</${name}>`);
		},
	});

	fragments.unshift(`<div id="${getBaseName(filename)}">`);
	parser.write(xhtml);
	parser.end();
	fragments.push("</div>");

	return [fragments.join(""), id, chars];
}

function getFilePath(basePath: string, fn: string): string {
	return basePath ? `${basePath}/${fn}` : fn;
}

function getBaseName(filePath: string): string {
	const parts = filePath.split("/");
	return parts[parts.length - 1];
}
