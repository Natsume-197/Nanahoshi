import type { ReadListenCue } from "@nanahoshi-v2/read-listen/manifest";

type TextSegment = {
	node: Text;
	startOffset: number;
	endOffset: number;
};

export type ResolvedReadListenAnchor = {
	segments: TextSegment[];
};

export type ReadListenAnchorTarget<T> = {
	anchor: ReadListenCue["text"];
	value: T;
};

export type ReadListenPositionMatch<T> = {
	value: T;
	resolved: ResolvedReadListenAnchor;
};

const IGNORED_SELECTOR =
	'script,style,noscript,svg,nav,rt,rp,[hidden],[aria-hidden="true"]';

function acceptedTextNodes(root: Element): Text[] {
	const showText = root.ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
	const walker = root.ownerDocument.createTreeWalker(root, showText);
	const nodes: Text[] = [];
	let current = walker.nextNode();
	while (current) {
		const node = current as Text;
		const parent = node.parentElement;
		if (node.data && parent && !parent.closest(IGNORED_SELECTOR))
			nodes.push(node);
		current = walker.nextNode();
	}
	return nodes;
}

function normalizedTextMap(nodes: Text[]) {
	const mapping: Array<{ node: Text; offset: number }> = [];
	let text = "";
	let previousWasSpace = false;
	for (const node of nodes) {
		for (let offset = 0; offset < node.data.length; offset += 1) {
			const character = node.data[offset] ?? "";
			const isSpace = /\s/u.test(character);
			if (isSpace) {
				if (!text || previousWasSpace) continue;
				text += " ";
				mapping.push({ node, offset });
				previousWasSpace = true;
				continue;
			}
			text += character;
			mapping.push({ node, offset });
			previousWasSpace = false;
		}
	}
	if (text.endsWith(" ")) {
		text = text.slice(0, -1);
		mapping.pop();
	}
	return { text, mapping };
}

function normalizeQuote(value: string): string {
	return value.replace(/\s+/gu, " ").trim();
}

function positionsByNode(mapping: Array<{ node: Text; offset: number }>) {
	const positions = new Map<
		Text,
		Array<{ normalizedOffset: number; sourceOffset: number }>
	>();
	for (const [normalizedOffset, point] of mapping.entries()) {
		const nodePositions = positions.get(point.node) ?? [];
		nodePositions.push({
			normalizedOffset,
			sourceOffset: point.offset,
		});
		positions.set(point.node, nodePositions);
	}
	return positions;
}

function indexedPosition(
	positions: ReturnType<typeof positionsByNode>,
	node: Text,
	offset: number,
): number {
	const nodePositions = positions.get(node);
	if (!nodePositions?.length) return -1;
	const atOrAfter = nodePositions.find(
		(position) => position.sourceOffset >= offset,
	);
	return (
		atOrAfter?.normalizedOffset ??
		(nodePositions.at(-1)?.normalizedOffset ?? -2) + 1
	);
}

function quoteStart(
	text: string,
	exact: string,
	prefix?: string,
	suffix?: string,
	fromIndex = 0,
): number {
	let start = text.indexOf(exact, fromIndex);
	let best = start;
	let bestScore = -1;
	const maximumScore = (prefix ? 2 : 0) + (suffix ? 2 : 0);
	while (start !== -1) {
		let score = 0;
		if (prefix && text.startsWith(prefix, start - prefix.length)) score += 2;
		if (suffix && text.startsWith(suffix, start + exact.length)) score += 2;
		if (score > bestScore) {
			best = start;
			bestScore = score;
		}
		if (score === maximumScore) return start;
		start = text.indexOf(exact, start + Math.max(1, exact.length));
	}
	return best;
}

function segmentsForRange(
	mapping: Array<{ node: Text; offset: number }>,
	start: number,
	end: number,
): TextSegment[] {
	const segments: TextSegment[] = [];
	for (const point of mapping.slice(start, end)) {
		const previous = segments.at(-1);
		if (previous?.node === point.node && previous.endOffset === point.offset) {
			previous.endOffset = point.offset + 1;
		} else {
			segments.push({
				node: point.node,
				startOffset: point.offset,
				endOffset: point.offset + 1,
			});
		}
	}
	return segments;
}

export function resolveReadListenAnchor(
	section: Element,
	anchor: ReadListenCue["text"],
): ResolvedReadListenAnchor | null {
	if (anchor.kind === "fragment") {
		const fragment = [...section.querySelectorAll<HTMLElement>("[id]")].find(
			(element) => element.id === anchor.fragmentId,
		);
		const nodes = acceptedTextNodes(fragment ?? section);
		return nodes.length
			? {
					segments: nodes.map((node) => ({
						node,
						startOffset: 0,
						endOffset: node.data.length,
					})),
				}
			: null;
	}

	const exact = normalizeQuote(anchor.exact);
	if (!exact) return null;
	const { text, mapping } = normalizedTextMap(acceptedTextNodes(section));
	const start = quoteStart(
		text,
		exact,
		anchor.prefix ? normalizeQuote(anchor.prefix) : undefined,
		anchor.suffix ? normalizeQuote(anchor.suffix) : undefined,
	);
	if (start < 0) return null;
	const segments = segmentsForRange(mapping, start, start + exact.length);
	return segments.length ? { segments } : null;
}

/** Builds one immutable lookup over a rendered section for pointer interaction. */
export function createReadListenPositionIndex<T>(
	section: Element,
	targets: ReadListenAnchorTarget<T>[],
): {
	matches: ReadListenPositionMatch<T>[];
	find(position: {
		node: Text;
		offset: number;
	}): ReadListenPositionMatch<T> | undefined;
} {
	const { text, mapping } = normalizedTextMap(acceptedTextNodes(section));
	const positions = positionsByNode(mapping);
	const textRanges: Array<{
		start: number;
		end: number;
		match: ReadListenPositionMatch<T>;
	}> = [];
	const fragments: Array<{
		id: string;
		match: ReadListenPositionMatch<T>;
	}> = [];
	const matches: ReadListenPositionMatch<T>[] = [];
	let nextQuoteStart = 0;
	for (const target of targets) {
		const anchor = target.anchor;
		if (anchor.kind === "fragment") {
			const fragment = [...section.querySelectorAll<HTMLElement>("[id]")].find(
				(element) => element.id === anchor.fragmentId,
			);
			const nodes = acceptedTextNodes(fragment ?? section);
			if (nodes.length) {
				const match = {
					value: target.value,
					resolved: {
						segments: nodes.map((node) => ({
							node,
							startOffset: 0,
							endOffset: node.data.length,
						})),
					},
				};
				fragments.push({
					id: anchor.fragmentId,
					match,
				});
				matches.push(match);
			}
			continue;
		}

		const exact = normalizeQuote(anchor.exact);
		const prefix = anchor.prefix ? normalizeQuote(anchor.prefix) : undefined;
		const suffix = anchor.suffix ? normalizeQuote(anchor.suffix) : undefined;
		let start = quoteStart(text, exact, prefix, suffix, nextQuoteStart);
		if (start < 0 && nextQuoteStart > 0) {
			start = quoteStart(text, exact, prefix, suffix);
		}
		if (start < 0) continue;
		nextQuoteStart = start + exact.length;
		const segments = segmentsForRange(mapping, start, start + exact.length);
		if (segments.length) {
			const match = {
				value: target.value,
				resolved: { segments },
			};
			textRanges.push({
				start,
				end: start + exact.length,
				match,
			});
			matches.push(match);
		}
	}
	textRanges.sort((left, right) => left.start - right.start);

	return {
		matches,
		find(position) {
			const fragment = position.node.parentElement?.closest("[id]");
			const fragmentMatch = fragments.find(
				(candidate) => candidate.id === fragment?.id,
			);
			if (fragmentMatch) return fragmentMatch.match;

			const positionIndex = indexedPosition(
				positions,
				position.node,
				position.offset,
			);
			if (positionIndex < 0) return undefined;
			let low = 0;
			let high = textRanges.length - 1;
			let candidate = -1;
			while (low <= high) {
				const middle = Math.floor((low + high) / 2);
				const range = textRanges[middle];
				if (!range || range.start > positionIndex) {
					high = middle - 1;
				} else {
					candidate = middle;
					low = middle + 1;
				}
			}
			const range = candidate >= 0 ? textRanges[candidate] : undefined;
			return range && positionIndex < range.end ? range.match : undefined;
		},
	};
}

/** Resolves a DOM caret back to an aligned cue without rewriting book markup. */
export function findReadListenTargetAtPosition<T>(
	section: Element,
	targets: ReadListenAnchorTarget<T>[],
	position: { node: Text; offset: number },
): T | undefined {
	return createReadListenPositionIndex(section, targets).find(position)?.value;
}

/** Paints a cue range through the CSS Highlights API without rewriting book markup. */
function installCssHighlight(
	name: string,
	resolved: ResolvedReadListenAnchor,
): (() => void) | null {
	const document = resolved.segments[0]?.node.ownerDocument;
	const view = document?.defaultView;
	if (!document || !view) return null;
	const registry = (
		view.CSS as typeof CSS & {
			highlights?: {
				set(name: string, highlight: unknown): void;
				delete(name: string): boolean;
			};
		}
	).highlights;
	const HighlightConstructor = (
		view as typeof view & {
			Highlight?: new (...ranges: Range[]) => unknown;
		}
	).Highlight;
	if (!registry || !HighlightConstructor) return null;

	const ranges = resolved.segments.flatMap((segment) => {
		if (!segment.node.isConnected) return [];
		const range = document.createRange();
		range.setStart(segment.node, segment.startOffset);
		range.setEnd(segment.node, segment.endOffset);
		return [range];
	});
	if (!ranges.length) return null;
	registry.set(name, new HighlightConstructor(...ranges));
	return () => {
		registry.delete(name);
	};
}

export function installReadListenHoverHighlight(
	resolved: ResolvedReadListenAnchor,
): (() => void) | null {
	return installCssHighlight("read-listen-hover", resolved);
}

export function installReadListenActiveHighlight(
	resolved: ResolvedReadListenAnchor,
): (() => void) | null {
	return installCssHighlight("read-listen-active", resolved);
}
