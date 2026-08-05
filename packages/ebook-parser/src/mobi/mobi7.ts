import { concatBytes, type MobiContainer } from "./binary";
import { type NcxItem, readNcx } from "./index-data";
import { parseResourceHref, resourceHref } from "./resources";
import type {
	MobiResolvedHref,
	MobiResource,
	MobiSection,
	MobiSource,
	MobiTocItem,
} from "./types";

interface LegacySectionReference {
	id: string;
	start: number;
	end: number;
	text: string;
}

const PAGE_BREAK = /<\s*(?:mbp:)?pagebreak\b[^>]*>/gi;

export class Mobi7Source implements MobiSource {
	readonly format = "mobi" as const;
	readonly metadata;
	readonly sections: readonly LegacySectionReference[];
	readonly toc: readonly MobiTocItem[];
	private readonly container: MobiContainer;

	constructor(container: MobiContainer) {
		this.container = container;
		this.metadata = container.getMetadata();
		const records = Array.from(
			{ length: container.palmDoc.numTextRecords },
			(_, index) => container.loadTextRecord(index),
		);
		const bytes = concatBytes(records);
		const searchable = new TextDecoder("windows-1252").decode(bytes);
		const matches = [...searchable.matchAll(PAGE_BREAK)];
		const starts = [
			0,
			...matches.map((match) => (match.index ?? 0) + match[0].length),
		];
		const ends = [...matches.map((match) => match.index ?? 0), bytes.length];
		this.sections = starts
			.map((start, index) => {
				const end = ends[index] ?? bytes.length;
				let text = container.decode(bytes.subarray(start, end));
				if (index === 0) text = stripBeforeBody(text);
				if (index === starts.length - 1) text = stripAfterBody(text);
				return { id: String(index), start, end, text };
			})
			.filter((section) => section.text.trim().length > 0);
		this.toc = this.readToc(searchable);
	}

	loadSection(id: string): MobiSection | undefined {
		const section = this.sections.find((candidate) => candidate.id === id);
		return section
			? { html: rewriteLegacyMarkup(section.text), styles: [] }
			: undefined;
	}

	loadResource(href: string): MobiResource | undefined {
		const parsed = parseResourceHref(href);
		if (parsed?.kind !== "embed") return undefined;
		const recordNumber = Number.parseInt(parsed.id, 10);
		return recordNumber > 0
			? this.container.loadResource(recordNumber - 1)
			: undefined;
	}

	getCover(): MobiResource | undefined {
		return this.container.getCover();
	}

	resolveHref(href: string): MobiResolvedHref | undefined {
		const value = href.match(/filepos:(\d+)/i)?.[1];
		if (!value) return undefined;
		const position = Number(value);
		const section = this.sections.find((candidate) => candidate.end > position);
		return section ? { id: section.id, selector: "" } : undefined;
	}

	private readToc(fullText: string): MobiTocItem[] {
		if (this.container.mobi.indx < 0xffff_ffff) {
			try {
				return readNcx(this.container.mobi.indx, (index) =>
					this.container.loadRecord(index),
				).map(mapNcx);
			} catch {
				// Older MOBI generators only provide a guide-based HTML TOC.
			}
		}
		const bodyStart = fullText.search(/<body\b/i);
		const preamble = bodyStart >= 0 ? fullText.slice(0, bodyStart) : fullText;
		const reference = [...preamble.matchAll(/<reference\b[^>]*>/gi)].find(
			(match) => /^toc$/i.test(attribute(match[0], "type") ?? ""),
		);
		const position = Number(attribute(reference?.[0] ?? "", "filepos"));
		if (!Number.isFinite(position)) return [];
		const section = this.sections.find((candidate) => candidate.end > position);
		return section ? parseHtmlToc(section.text) : [];
	}
}

function rewriteLegacyMarkup(html: string): string {
	return html
		.replace(/<img\b[^>]*>/gi, (tag) =>
			rewriteAttribute(tag, "recindex", "src", (id) =>
				resourceHref("embed", id),
			),
		)
		.replace(/<(?:video|audio)\b[^>]*>/gi, (tag) => {
			let output = rewriteAttribute(tag, "mediarecindex", "src", (id) =>
				resourceHref("embed", id),
			);
			output = rewriteAttribute(output, "recindex", "poster", (id) =>
				resourceHref("embed", id),
			);
			return output;
		})
		.replace(/<a\b[^>]*>/gi, (tag) =>
			rewriteAttribute(tag, "filepos", "href", (id) => `filepos:${id}`),
		);
}

function rewriteAttribute(
	tag: string,
	source: string,
	target: string,
	value: (raw: string) => string,
): string {
	const pattern = new RegExp(
		`\\s${source}\\s*=\\s*(?:(["'])(.*?)\\1|(\\d+))`,
		"i",
	);
	const match = tag.match(pattern);
	const raw = match?.[2] ?? match?.[3];
	return raw ? tag.replace(pattern, ` ${target}="${value(raw)}"`) : tag;
}

function stripBeforeBody(text: string): string {
	const match = text.match(/<body\b[^>]*>/i);
	return match?.index === undefined
		? text
		: text.slice(match.index + match[0].length);
}

function stripAfterBody(text: string): string {
	const index = text.search(/<\/body\s*>/i);
	return index < 0 ? text : text.slice(0, index);
}

function mapNcx(item: NcxItem): MobiTocItem {
	return {
		label: item.label,
		href: `filepos:${item.offset ?? 0}`,
		children: item.children?.map(mapNcx),
	};
}

function parseHtmlToc(html: string): MobiTocItem[] {
	const root: MobiTocItem[] = [];
	const levels: MobiTocItem[][] = [root];
	for (const match of html.matchAll(
		/<blockquote\b[^>]*>|<\/blockquote\s*>|<a\b[^>]*>[\s\S]*?<\/a>/gi,
	)) {
		const token = match[0];
		if (/^<blockquote\b/i.test(token)) {
			const parent = levels.at(-1)?.at(-1);
			if (parent) {
				parent.children ??= [];
				levels.push(parent.children);
			}
			continue;
		}
		if (/^<\/blockquote/i.test(token)) {
			if (levels.length > 1) levels.pop();
			continue;
		}
		const filepos = attribute(token, "filepos");
		if (!filepos) continue;
		const label = token
			.replace(/^<a\b[^>]*>|<\/a>$/gi, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (label) levels.at(-1)?.push({ label, href: `filepos:${filepos}` });
	}
	return root;
}

function attribute(tag: string, name: string): string | undefined {
	const match = tag.match(
		new RegExp(`\\s${name}\\s*=\\s*(?:(["'])(.*?)\\1|([^\\s>]+))`, "i"),
	);
	return match?.[2] ?? match?.[3];
}
