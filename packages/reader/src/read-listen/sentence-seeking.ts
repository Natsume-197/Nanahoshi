import {
	getReadListenPositionIndex,
	type ReadListenAnchorTarget,
} from "./text-anchor";

const INTERACTIVE_SELECTOR =
	'button,a,input,select,textarea,[contenteditable="true"],[role="button"]';

function pointTouchesRenderedCharacter(
	document: Document,
	node: Text,
	offset: number,
	x: number,
	y: number,
): boolean {
	for (const characterOffset of [offset, offset - 1]) {
		const character = node.data[characterOffset];
		if (!character || /\s/u.test(character)) continue;
		const range = document.createRange();
		range.setStart(node, characterOffset);
		range.setEnd(node, characterOffset + 1);
		for (const rect of range.getClientRects()) {
			if (
				x >= rect.left &&
				x <= rect.right &&
				y >= rect.top &&
				y <= rect.bottom
			) {
				return true;
			}
		}
	}
	return false;
}

function caretAtPoint(
	document: Document,
	x: number,
	y: number,
): { node: Text; offset: number } | null {
	const caretDocument = document as Document & {
		caretPositionFromPoint?: (
			x: number,
			y: number,
		) => { offsetNode: Node; offset: number } | null;
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
	};
	const position = caretDocument.caretPositionFromPoint?.(x, y);
	if (position?.offsetNode.nodeType === 3) {
		const node = position.offsetNode as Text;
		if (pointTouchesRenderedCharacter(document, node, position.offset, x, y)) {
			return { node, offset: position.offset };
		}
	}
	const range = caretDocument.caretRangeFromPoint?.(x, y);
	if (range?.startContainer.nodeType === 3) {
		const node = range.startContainer as Text;
		if (
			pointTouchesRenderedCharacter(document, node, range.startOffset, x, y)
		) {
			return { node, offset: range.startOffset };
		}
	}
	return null;
}

/**
 * Adds one delegated click interaction to the rendered book. Section indexes
 * are created lazily and retained until their DOM element is replaced.
 */
export function bindReadListenSentenceSeeking<T>({
	surface,
	targetsBySection,
	onActivate,
}: {
	surface: HTMLElement;
	targetsBySection: Map<string, ReadListenAnchorTarget<T>[]>;
	onActivate: (value: T) => void;
}): () => void {
	surface.dataset.readListenSentenceSeek = "";
	const indexForSection = (
		section: Element,
		targets: ReadListenAnchorTarget<T>[],
	) => getReadListenPositionIndex(section, targets);

	const resolvePointer = (
		target: Element,
		clientX: number,
		clientY: number,
	) => {
		if (target.closest(INTERACTIVE_SELECTOR)) return undefined;
		let section: Element | null = target;
		while (section && !targetsBySection.has(section.id)) {
			section = section.parentElement;
		}
		if (!section) return undefined;
		const position = caretAtPoint(section.ownerDocument, clientX, clientY);
		if (!position) return undefined;
		const index = indexForSection(
			section,
			targetsBySection.get(section.id) ?? [],
		);
		return index.find(position);
	};
	const handleSentenceClick = (event: MouseEvent) => {
		const ElementConstructor = surface.ownerDocument.defaultView?.Element;
		if (!ElementConstructor || !(event.target instanceof ElementConstructor)) {
			return;
		}
		const target = event.target as Element;
		if (target.closest(INTERACTIVE_SELECTOR)) return;
		const match = resolvePointer(target, event.clientX, event.clientY);
		if (match) onActivate(match.value);
	};

	surface.addEventListener("click", handleSentenceClick);
	return () => {
		delete surface.dataset.readListenSentenceSeek;
		surface.removeEventListener("click", handleSentenceClick);
	};
}
