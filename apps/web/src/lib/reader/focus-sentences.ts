import {
	countTextCharacters,
	getCharacterCount,
	isNodeImage,
} from "./character-count";
import type { ReaderTextAnchor } from "./types";

interface TextPoint {
	node: Text;
	offset: number;
}

export interface FocusSentence {
	text: string;
	startCharacter: number;
	endCharacter: number;
	sectionReference: string;
	fragmentIds: string[];
	html: string;
}

export interface FocusSectionRange {
	startCharacter: number;
	endCharacter: number;
}

export interface FocusDocument {
	sentences: FocusSentence[];
	sectionRanges: Map<string, FocusSectionRange>;
	anchorCharacters: Map<string, number>;
	quoteCharacters: Map<string, number[]>;
	totalCharacters: number;
}

const BLOCK_SELECTOR =
	"address,article,aside,blockquote,dd,div,dl,dt,figcaption,figure,footer,h1,h2,h3,h4,h5,h6,header,li,main,nav,ol,p,pre,section,table,td,th,tr,ul";
const CACHE_LIMIT = 2;
const CACHE_BYTES_LIMIT = 16 * 1024 * 1024;
const MAX_SECTION_HTML_CHARS = 2 * 1024 * 1024;
const MAX_RICH_SENTENCE_CHARS = 20_000;
interface FocusCacheEntry {
	signature: string;
	sizeBytes: number;
	signal?: AbortSignal;
	promise: Promise<FocusDocument>;
}

const focusDocumentCache = new Map<string, FocusCacheEntry>();
const segmenterCache = new Map<string, Intl.Segmenter>();

class MainThreadBudget {
	private deadline: number;

	constructor(
		private readonly sliceMs: number,
		private readonly signal?: AbortSignal,
	) {
		this.deadline = performance.now() + sliceMs;
	}

	async checkpoint(force = false) {
		this.signal?.throwIfAborted();
		if (!force && performance.now() < this.deadline) return;
		const scheduler = (
			globalThis as typeof globalThis & {
				scheduler?: { yield?: () => Promise<void> };
			}
		).scheduler as { yield?: () => Promise<void> } | undefined;
		if (scheduler?.yield) await scheduler.yield();
		else await new Promise<void>((resolve) => setTimeout(resolve, 0));
		this.signal?.throwIfAborted();
		this.deadline = performance.now() + this.sliceMs;
	}
}

async function groupNodesByBlock(
	root: Element,
	nodes: readonly Node[],
	budget: MainThreadBudget,
) {
	const groups = new Map<Element, Text[]>();
	for (const [index, node] of nodes.entries()) {
		if (node.nodeType !== Node.TEXT_NODE) continue;
		const text = node as Text;
		const closestBlock = text.parentElement?.closest(BLOCK_SELECTOR);
		const block =
			closestBlock && root.contains(closestBlock) ? closestBlock : root;
		const group = groups.get(block) ?? [];
		group.push(text);
		groups.set(block, group);
		if (index > 0 && index % 500 === 0) await budget.checkpoint();
	}
	return [...groups.entries()];
}

async function paragraphNodes(
	section: Element,
	budget: MainThreadBudget,
): Promise<Node[]> {
	const view = section.ownerDocument.defaultView;
	const show =
		(view?.NodeFilter.SHOW_ELEMENT ?? 1) | (view?.NodeFilter.SHOW_TEXT ?? 4);
	const accept = view?.NodeFilter.FILTER_ACCEPT ?? 1;
	const reject = view?.NodeFilter.FILTER_REJECT ?? 2;
	const skip = view?.NodeFilter.FILTER_SKIP ?? 3;
	const walker = section.ownerDocument.createTreeWalker(section, show, {
		acceptNode(node) {
			if (
				node.nodeName === "RT" ||
				(node.nodeType === Node.ELEMENT_NODE &&
					((node as Element).hasAttribute("aria-hidden") ||
						(node as Element).hasAttribute("hidden")))
			) {
				return reject;
			}
			if (isNodeImage(node)) return accept;
			if (node.nodeType === Node.TEXT_NODE) {
				return node.textContent?.replace(/\s/gu, "").length ? accept : skip;
			}
			return skip;
		},
	});
	const result: Node[] = [];
	let node = walker.nextNode();
	while (node) {
		result.push(node);
		if (result.length % 500 === 0) await budget.checkpoint();
		node = walker.nextNode();
	}
	return result;
}

async function normalizedTextMap(nodes: Text[], budget: MainThreadBudget) {
	const mapping: TextPoint[] = [];
	let text = "";
	let previousWasSpace = false;
	let visited = 0;

	for (const node of nodes) {
		for (let offset = 0; offset < node.data.length; offset += 1) {
			const character = node.data[offset] ?? "";
			const isSpace = /\s/u.test(character);
			if (isSpace) {
				if (!text || previousWasSpace) continue;
				text += " ";
				mapping.push({ node, offset });
				previousWasSpace = true;
			} else {
				text += character;
				mapping.push({ node, offset });
				previousWasSpace = false;
			}
			visited += 1;
			if (visited % 2_000 === 0) await budget.checkpoint();
		}
	}

	if (text.endsWith(" ")) {
		text = text.slice(0, -1);
		mapping.pop();
	}
	return { text, mapping };
}

function* fallbackSentenceRanges(text: string) {
	const pattern =
		/[^.!?。！？]+(?:[.!?。！？]+[”’"'」』）】〕〉》]*)?|[.!?。！？]+/gu;
	for (const match of text.matchAll(pattern)) {
		yield { start: match.index, end: match.index + match[0].length };
	}
}

function getSentenceSegmenter(language: string) {
	if (typeof Intl.Segmenter !== "function") return undefined;
	const key = language || "default";
	const cached = segmenterCache.get(key);
	if (cached) return cached;
	let segmenter: Intl.Segmenter;
	try {
		segmenter = new Intl.Segmenter(language || undefined, {
			granularity: "sentence",
		});
	} catch {
		segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
	}
	segmenterCache.set(key, segmenter);
	return segmenter;
}

function* sentenceRanges(text: string, language: string) {
	const segmenter = getSentenceSegmenter(language);
	if (!segmenter) {
		yield* fallbackSentenceRanges(text);
		return;
	}
	for (const part of segmenter.segment(text)) {
		yield { start: part.index, end: part.index + part.segment.length };
	}
}

function trimRange(text: string, start: number, end: number) {
	let trimmedStart = start;
	let trimmedEnd = end;
	while (trimmedStart < trimmedEnd && /\s/u.test(text[trimmedStart] ?? "")) {
		trimmedStart += 1;
	}
	while (trimmedEnd > trimmedStart && /\s/u.test(text[trimmedEnd - 1] ?? "")) {
		trimmedEnd -= 1;
	}
	return { start: trimmedStart, end: trimmedEnd };
}

function fragmentIdsForNodes(section: Element, nodes: readonly Text[]) {
	const ids = new Set<string>();
	for (const node of nodes) {
		let element = node.parentElement;
		while (element && element !== section) {
			if (element.id) ids.add(element.id);
			element = element.parentElement;
		}
	}
	return [...ids];
}

function sentenceHtml(
	document: Document,
	text: string,
	fragmentIds: readonly string[],
	start: TextPoint,
	end: TextPoint,
) {
	if (text.length > MAX_RICH_SENTENCE_CHARS) {
		const fallback = document.createElement("div");
		fallback.textContent = text;
		return fallback.innerHTML;
	}
	const range = document.createRange();
	range.setStart(start.node, start.offset);
	range.setEnd(end.node, end.offset + 1);
	const wrapper = document.createElement("div");
	wrapper.append(range.cloneContents());
	for (const element of wrapper.querySelectorAll("[id]")) {
		if (!fragmentIds.includes(element.id)) element.removeAttribute("id");
	}
	for (const element of wrapper.querySelectorAll(
		"img,picture,svg,audio,video,button,input,select,textarea",
	)) {
		element.remove();
	}
	for (const anchor of wrapper.querySelectorAll("a")) {
		anchor.replaceWith(...anchor.childNodes);
	}
	if (wrapper.textContent?.trim()) return wrapper.innerHTML;
	wrapper.textContent = text;
	return wrapper.innerHTML;
}

export function focusSentenceHtml(
	_document: Document,
	sentence: FocusSentence,
) {
	return sentence.html;
}

async function buildFocusDocumentUncached({
	htmlContent,
	language,
	document,
	sectionReferences,
	signal,
}: {
	htmlContent: string;
	language: string;
	document: Document;
	sectionReferences?: readonly string[];
	signal?: AbortSignal;
}): Promise<FocusDocument> {
	const budget = new MainThreadBudget(8, signal);
	await budget.checkpoint(true);
	const chunks = sectionHtmlChunks(htmlContent, sectionReferences);
	const staging = document.createElement("div");

	const sentences: FocusSentence[] = [];
	const sectionRanges = new Map<string, FocusSectionRange>();
	const anchorCharacters = new Map<string, number>();
	const quoteCharacters = new Map<string, number[]>();
	let exploredCharacter = 0;

	for (const [sectionIndex, chunk] of chunks.entries()) {
		await budget.checkpoint(true);
		if (chunk.length > MAX_SECTION_HTML_CHARS) {
			throw new Error(
				"This publication section is too large to prepare safely in Focus mode",
			);
		}
		staging.innerHTML = chunk;
		const section = staging.firstElementChild;
		if (!section) continue;
		const sectionStart = exploredCharacter;
		const sectionReference = section.id || `focus-section-${sectionIndex}`;
		const sectionParagraphNodes = await paragraphNodes(section, budget);
		const nodeStartCharacters = new Map<Node, number>();
		const internalAnchorCharacters = new Map<string, number>();
		let sectionCharacterCount = 0;
		for (const [nodeIndex, node] of sectionParagraphNodes.entries()) {
			nodeStartCharacters.set(node, sectionCharacterCount);
			let ancestor = node.parentElement;
			while (ancestor && ancestor !== section) {
				if (ancestor.id && !internalAnchorCharacters.has(ancestor.id)) {
					internalAnchorCharacters.set(ancestor.id, sectionCharacterCount);
				}
				ancestor = ancestor.parentElement;
			}
			sectionCharacterCount += getCharacterCount(node);
			if (nodeIndex % 500 === 0) await budget.checkpoint();
		}

		anchorCharacters.set(sectionReference, sectionStart);
		for (const [id, character] of internalAnchorCharacters) {
			anchorCharacters.set(id, sectionStart + character);
		}

		for (const [, nodes] of await groupNodesByBlock(
			section,
			sectionParagraphNodes,
			budget,
		)) {
			const { text, mapping } = await normalizedTextMap(nodes, budget);
			const fragmentIds = fragmentIdsForNodes(section, nodes);
			for (const candidate of sentenceRanges(text, language)) {
				const { start, end } = trimRange(text, candidate.start, candidate.end);
				if (start >= end) continue;
				const sentenceText = text.slice(start, end);
				const characterCount = countTextCharacters(sentenceText);
				if (characterCount === 0) continue;
				const first = mapping[start];
				const last = mapping[end - 1];
				if (!first || !last) continue;
				const startCharacter =
					sectionStart +
					(nodeStartCharacters.get(first.node) ?? 0) +
					countTextCharacters(first.node.data.slice(0, first.offset));
				const endCharacter =
					sectionStart +
					(nodeStartCharacters.get(last.node) ?? 0) +
					countTextCharacters(last.node.data.slice(0, last.offset + 1));
				const sentence: FocusSentence = {
					text: sentenceText,
					startCharacter,
					endCharacter,
					sectionReference,
					fragmentIds,
					html: sentenceHtml(document, sentenceText, fragmentIds, first, last),
				};
				sentences.push(sentence);
				const quoteKey = `${sectionReference}\u0000${normalizeQuote(sentenceText)}`;
				const quoteMatches = quoteCharacters.get(quoteKey) ?? [];
				quoteMatches.push(startCharacter);
				quoteCharacters.set(quoteKey, quoteMatches);
				await budget.checkpoint();
			}
		}

		exploredCharacter = sectionStart + sectionCharacterCount;
		sectionRanges.set(sectionReference, {
			startCharacter: sectionStart,
			endCharacter: exploredCharacter,
		});
		await budget.checkpoint();
		staging.replaceChildren();
	}

	return {
		sentences,
		sectionRanges,
		anchorCharacters,
		quoteCharacters,
		totalCharacters: exploredCharacter,
	};
}

function sectionHtmlChunks(
	htmlContent: string,
	sectionReferences?: readonly string[],
) {
	if (!sectionReferences?.length) return [htmlContent];
	const starts: number[] = [];
	let cursor = 0;
	for (const reference of sectionReferences) {
		const idIndex = htmlContent.indexOf(`id="${reference}"`, cursor);
		if (idIndex < 0) return [htmlContent];
		const tagStart = htmlContent.lastIndexOf("<", idIndex);
		if (tagStart < cursor) return [htmlContent];
		starts.push(tagStart);
		cursor = idIndex + reference.length;
	}
	return starts.map((start, index) =>
		htmlContent.slice(start, starts[index + 1] ?? htmlContent.length),
	);
}

export function loadFocusDocument(input: {
	cacheKey: string;
	htmlContent: string;
	language: string;
	document: Document;
	sectionReferences?: readonly string[];
	signal?: AbortSignal;
}) {
	const key = `${input.cacheKey}:${input.language}`;
	const signature = contentSignature(input.htmlContent);
	const cached = focusDocumentCache.get(key);
	if (cached?.signature === signature && !cached.signal?.aborted) {
		focusDocumentCache.delete(key);
		focusDocumentCache.set(key, cached);
		return cached.promise;
	}
	const entry: FocusCacheEntry = {
		signature,
		sizeBytes: 0,
		signal: input.signal,
		promise: Promise.resolve({} as FocusDocument),
	};
	entry.promise = buildFocusDocumentUncached(input)
		.then((parsed) => {
			entry.signal = undefined;
			entry.sizeBytes = parsed.sentences.reduce(
				(bytes, sentence) =>
					bytes + (sentence.text.length + sentence.html.length) * 2 + 128,
				0,
			);
			evictFocusCache();
			return parsed;
		})
		.catch((error) => {
			if (focusDocumentCache.get(key) === entry) {
				focusDocumentCache.delete(key);
			}
			throw error;
		});
	focusDocumentCache.set(key, entry);
	input.signal?.addEventListener(
		"abort",
		() => {
			if (entry.signal?.aborted && focusDocumentCache.get(key) === entry) {
				focusDocumentCache.delete(key);
			}
		},
		{ once: true },
	);
	evictFocusCache();
	return entry.promise;
}

function contentSignature(content: string) {
	return `${content.length}:${content.slice(0, 512)}:${content.slice(-512)}`;
}

function evictFocusCache() {
	let totalBytes = [...focusDocumentCache.values()].reduce(
		(total, entry) => total + entry.sizeBytes,
		0,
	);
	while (
		focusDocumentCache.size > CACHE_LIMIT ||
		totalBytes > CACHE_BYTES_LIMIT
	) {
		const oldest = focusDocumentCache.keys().next().value;
		if (oldest === undefined) break;
		const entry = focusDocumentCache.get(oldest);
		focusDocumentCache.delete(oldest);
		totalBytes -= entry?.sizeBytes ?? 0;
	}
}

/** Uncached builder used by deterministic unit tests. */
export function buildFocusDocument(input: {
	htmlContent: string;
	language: string;
	document: Document;
	sectionReferences?: readonly string[];
	signal?: AbortSignal;
}) {
	return buildFocusDocumentUncached(input);
}

export function findFocusSentenceIndex(
	sentences: readonly FocusSentence[],
	exploredCharacter: number,
) {
	if (sentences.length === 0) return 0;
	let low = 0;
	let high = sentences.length - 1;
	let result = high;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const sentence = sentences[middle];
		if (sentence && sentence.endCharacter > exploredCharacter) {
			result = middle;
			high = middle - 1;
		} else {
			low = middle + 1;
		}
	}
	return result;
}

const normalizeQuote = (value: string) => value.replace(/\s+/gu, " ").trim();

export function resolveFocusTextAnchor(
	document: FocusDocument,
	anchor: ReaderTextAnchor,
	nearCharacter = 0,
) {
	if (anchor.kind === "fragment") {
		return document.anchorCharacters.get(anchor.fragmentId);
	}
	const exact = normalizeQuote(anchor.exact);
	if (!exact) return undefined;
	const directMatches = document.quoteCharacters.get(
		`${anchor.sectionReference}\u0000${exact}`,
	);
	if (directMatches?.length) {
		if (
			anchor.occurrence !== undefined &&
			directMatches[anchor.occurrence] !== undefined
		) {
			return directMatches[anchor.occurrence];
		}
		return [...directMatches].sort(
			(left, right) =>
				Math.abs(left - nearCharacter) - Math.abs(right - nearCharacter),
		)[0];
	}
	const candidates = document.sentences.flatMap((sentence, index) => {
		if (sentence.sectionReference !== anchor.sectionReference) return [];
		const text = normalizeQuote(sentence.text);
		const matchIndex = text.indexOf(exact);
		if (matchIndex < 0) return [];
		const previous = normalizeQuote(document.sentences[index - 1]?.text ?? "");
		const next = normalizeQuote(document.sentences[index + 1]?.text ?? "");
		let score = 0;
		if (
			anchor.prefix &&
			`${previous} ${text}`.includes(normalizeQuote(anchor.prefix))
		) {
			score += 1;
		}
		if (
			anchor.suffix &&
			`${text} ${next}`.includes(normalizeQuote(anchor.suffix))
		) {
			score += 1;
		}
		return [
			{
				character:
					sentence.startCharacter +
					countTextCharacters(text.slice(0, matchIndex)),
				score,
			},
		];
	});
	if (anchor.occurrence !== undefined) {
		return candidates[anchor.occurrence]?.character;
	}
	return candidates.sort(
		(left, right) =>
			right.score - left.score ||
			Math.abs(left.character - nearCharacter) -
				Math.abs(right.character - nearCharacter) ||
			left.character - right.character,
	)[0]?.character;
}
