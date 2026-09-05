import {
	getCharacterCount,
	sourceOffsetForCharacterCount,
} from "@/features/reader/document/processing/character-count";
import { getParagraphNodes } from "@/features/reader/document/processing/get-paragraph-nodes";
import type { ReaderPosition, Section } from "@/features/reader/document/types";
import { createReaderPositionCore } from "./reader-position";

function scopeFor(node: Node, root: Element, sections: readonly Section[]) {
	let element =
		node.nodeType === Node.ELEMENT_NODE
			? (node as Element)
			: node.parentElement;
	while (element && root.contains(element)) {
		const sentenceStart = element.getAttribute("data-reader-character-start");
		if (sentenceStart !== null)
			return { element, start: Number(sentenceStart) };
		const section = sections.find(
			(section) =>
				section.reference === element?.id &&
				section.startCharacter !== undefined,
		);
		if (section) return { element, start: section.startCharacter ?? 0 };
		element = element.parentElement;
	}
	return undefined;
}

/** Count the source before the selection, excluding ruby annotations and controls. */
export function readingPointForSelection(
	range: Range,
	root: Element,
	sections: readonly Section[],
	total: number,
): ReaderPosition | undefined {
	if (
		range.collapsed ||
		!root.contains(range.startContainer) ||
		!root.contains(range.endContainer)
	)
		return undefined;
	const scope = scopeFor(range.startContainer, root, sections);
	if (!scope) return undefined;
	const prefix = root.ownerDocument.createRange();
	prefix.selectNodeContents(scope.element);
	prefix.setEnd(range.startContainer, range.startOffset);
	const count = getParagraphNodes(prefix.cloneContents()).reduce(
		(sum, node) => sum + getCharacterCount(node),
		0,
	);
	return createReaderPositionCore({
		sections,
		getCharacterCount: () => total,
	}).positionFor(scope.start + count);
}

/** Resolve once per layout; scrolling only reads the resulting Range's rectangle. */
export function rangeForReadingPoint(
	root: Element,
	position: ReaderPosition,
	sections: readonly Section[],
): Range | undefined {
	const focus = root.hasAttribute("data-reader-character-start")
		? (root as HTMLElement)
		: root.querySelector<HTMLElement>("[data-reader-character-start]");
	const section = [...sections]
		.reverse()
		.find(
			(section) =>
				section.startCharacter !== undefined &&
				section.startCharacter <= position.exploredCharCount &&
				!section.parentChapter,
		);
	const element =
		focus ??
		(section
			? root.ownerDocument.getElementById(section.reference)
			: undefined);
	if (!element || !root.contains(element)) return undefined;
	let remaining =
		position.exploredCharCount -
		(focus
			? Number(focus.dataset.readerCharacterStart)
			: (section?.startCharacter ?? 0));
	if (remaining < 0) return undefined;
	for (const node of getParagraphNodes(element)) {
		const count = getCharacterCount(node);
		if (remaining >= count) {
			remaining -= count;
			continue;
		}
		const range = root.ownerDocument.createRange();
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node as Text;
			const offset = sourceOffsetForCharacterCount(text.data, remaining);
			const length = (text.data.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1;
			range.setStart(text, offset);
			range.setEnd(text, Math.min(text.length, offset + length));
		} else range.selectNode(node);
		return range;
	}
	return undefined;
}
