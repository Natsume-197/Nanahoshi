import {
	countTextCharactersBeforeOffset,
	getCharacterCount,
} from "@/features/reader/document/processing/character-count";
import { getParagraphNodes } from "@/features/reader/document/processing/get-paragraph-nodes";
import type { ReaderTextAnchor } from "@/features/reader/document/types";

type TextPoint = {
	node: Text;
	offset: number;
};

function normalizedSectionText(nodes: readonly Node[]) {
	const mapping: TextPoint[] = [];
	let text = "";
	let previousWasSpace = false;
	for (const node of nodes) {
		if (node.nodeType !== Node.TEXT_NODE) continue;
		const textNode = node as Text;
		for (
			let sourceOffset = 0;
			sourceOffset < textNode.data.length;
			sourceOffset += 1
		) {
			const character = textNode.data[sourceOffset] ?? "";
			const isSpace = /\s/u.test(character);
			if (isSpace) {
				if (text && !previousWasSpace) {
					text += " ";
					mapping.push({ node: textNode, offset: sourceOffset });
				}
				previousWasSpace = true;
			} else {
				text += character;
				mapping.push({ node: textNode, offset: sourceOffset });
				previousWasSpace = false;
			}
		}
	}
	if (text.endsWith(" ")) {
		text = text.slice(0, -1);
		mapping.pop();
	}
	return { text, mapping };
}

function characterOffsetAt(
	nodes: readonly Node[],
	targetNode: Text,
	targetOffset: number,
) {
	let characterOffset = 0;
	for (const node of nodes) {
		if (node === targetNode) {
			return (
				characterOffset +
				countTextCharactersBeforeOffset(targetNode.data, targetOffset)
			);
		}
		characterOffset += getCharacterCount(node);
	}
	return undefined;
}

const normalizeQuote = (value: string) => value.replace(/\s+/gu, " ").trim();

/** Resolves a semantic anchor to its reader-position offset within a section. */
export function resolveReaderTextAnchorOffset(
	section: Element,
	anchor: ReaderTextAnchor,
): number | undefined {
	const nodes = getParagraphNodes(section);
	if (anchor.kind === "fragment") {
		const fragment =
			(section.id === anchor.fragmentId ? section : null) ??
			Array.from(section.querySelectorAll<HTMLElement>("[id]")).find(
				(element) => element.id === anchor.fragmentId,
			);
		if (!fragment) return undefined;
		const firstTextNode = nodes.find(
			(node): node is Text =>
				node.nodeType === Node.TEXT_NODE &&
				Boolean(node.parentElement && fragment.contains(node.parentElement)),
		);
		return firstTextNode
			? characterOffsetAt(nodes, firstTextNode, 0)
			: undefined;
	}

	const exact = normalizeQuote(anchor.exact);
	if (!exact) return undefined;
	const { text, mapping } = normalizedSectionText(nodes);
	const matches: number[] = [];
	let fromIndex = 0;
	while (fromIndex <= text.length - exact.length) {
		const match = text.indexOf(exact, fromIndex);
		if (match < 0) break;
		matches.push(match);
		fromIndex = match + Math.max(1, exact.length);
	}
	if (!matches.length) return undefined;

	const occurrence =
		anchor.occurrence === undefined
			? undefined
			: Math.max(0, anchor.occurrence);
	const occurrenceMatch =
		occurrence === undefined ? undefined : matches[occurrence];
	if (occurrenceMatch !== undefined) {
		const point = mapping[occurrenceMatch];
		return point
			? characterOffsetAt(nodes, point.node, point.offset)
			: undefined;
	}
	const prefix = anchor.prefix ? normalizeQuote(anchor.prefix) : undefined;
	const suffix = anchor.suffix ? normalizeQuote(anchor.suffix) : undefined;
	let contextualMatch = matches[0];
	let contextualScore = -1;
	for (const match of matches) {
		const score =
			(prefix && text.slice(0, match).endsWith(prefix) ? 1 : 0) +
			(suffix && text.slice(match + exact.length).startsWith(suffix) ? 1 : 0);
		if (score > contextualScore) {
			contextualMatch = match;
			contextualScore = score;
		}
	}
	const point =
		contextualMatch === undefined ? undefined : mapping[contextualMatch];
	return point ? characterOffsetAt(nodes, point.node, point.offset) : undefined;
}
