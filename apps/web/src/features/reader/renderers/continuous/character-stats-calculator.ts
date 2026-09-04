import { binarySearchNoNegative } from "@/features/reader/document/processing/binary-search";
import {
	countTextCharactersBeforeOffset,
	getCharacterCount,
	isNodeImage,
	sourceOffsetForCharacterCount,
} from "@/features/reader/document/processing/character-count";
import { getParagraphNodes } from "@/features/reader/document/processing/get-paragraph-nodes";
import { getNodeBoundingRect } from "@/features/reader/document/processing/range-util";
import { formatPos } from "./continuous-primitives";

export class CharacterStatsCalculator {
	readonly charCount: number;

	readonly accumulatedCharCount: number[];

	readonly paragraphPos: number[];

	private readonly paragraphs: Node[];

	private readonly nodeStartCharacters = new Map<Node, number>();

	private paragraphPosToAccCharCount = new Map<number, number>();
	private hasParagraphPositions = false;

	constructor(
		public readonly containerEl: HTMLElement,
		private readonly axis: "horizontal" | "vertical",
		public readonly direction: "ltr" | "rtl",
		private readonly scrollEl: HTMLElement,
		private readonly document: Document,
	) {
		this.paragraphs = getParagraphNodes(containerEl);

		this.paragraphPos = Array(this.paragraphs.length);
		this.accumulatedCharCount = [];
		let exploredCharCount = 0;
		for (const node of this.paragraphs) {
			this.nodeStartCharacters.set(node, exploredCharCount);
			exploredCharCount += getCharacterCount(node);
			this.accumulatedCharCount.push(exploredCharCount);
		}
		this.charCount = exploredCharCount;
	}

	get verticalMode() {
		return this.axis === "vertical";
	}

	/**
	 * The reading-edge reference the paragraph offsets are measured against: the
	 * scroll element's leading edge (formatted for direction) and the container's
	 * leading padding. Shared by updateParagraphPos and getReadingEdgeScrollPos.
	 */
	private getReadingReference() {
		const scrollElRect = this.getViewportRect();
		const scrollElRef = formatPos(
			this.verticalMode ? scrollElRect.right : scrollElRect.top,
			this.direction,
		);
		const dimensionAdjustment = Number(
			getComputedStyle(this.containerEl)[
				this.verticalMode ? "paddingRight" : "paddingTop"
			].replace(/px$/, ""),
		);
		return { scrollElRef, dimensionAdjustment };
	}

	updateParagraphPos(scrollPos = 0) {
		const { scrollElRef, dimensionAdjustment } = this.getReadingReference();
		const paragraphPosToIndices = new Map<number, number[]>();
		for (let i = 0; i < this.paragraphs.length; i += 1) {
			const node = this.paragraphs[i];

			const nodeRect = getNodeBoundingRect(this.document, node);

			const getParagraphPos = () => {
				const paragraphSize = this.verticalMode
					? nodeRect.width
					: nodeRect.height;
				if (paragraphSize <= 0) {
					return this.paragraphPos[i - 1] || 0;
				}
				const nodeLeft = formatPos(
					this.verticalMode ? nodeRect.left : nodeRect.bottom,
					this.direction,
				);

				return nodeLeft - scrollElRef - dimensionAdjustment + scrollPos;
			};
			const paragraphPos = getParagraphPos();
			this.paragraphPos[i] = paragraphPos;

			const indices = paragraphPosToIndices.get(paragraphPos) || [];
			paragraphPosToIndices.set(paragraphPos, indices);
			indices.push(i);
		}

		this.paragraphPosToAccCharCount = new Map(
			Array.from(paragraphPosToIndices.entries()).map(
				([paragraphPos, indices]) => [
					paragraphPos,
					Math.max(...indices.map((i) => this.accumulatedCharCount[i])),
				],
			),
		);
		this.hasParagraphPositions = true;
	}

	/**
	 * Rebuilds paragraph geometry in small tasks. Live setting changes can touch
	 * tens of thousands of text nodes; yielding prevents the final debounced
	 * relayout from becoming one proportional main-thread stall.
	 */
	async updateParagraphPosCooperative(
		scrollPos = this.scrollPos,
		isCancelled: () => boolean = () => false,
	) {
		this.hasParagraphPositions = false;
		const { scrollElRef, dimensionAdjustment } = this.getReadingReference();
		const initialScrollPos = this.scrollPos;
		const nextParagraphPos = Array<number>(this.paragraphs.length);
		const paragraphPosToIndices = new Map<number, number[]>();
		for (let i = 0; i < this.paragraphs.length; i += 1) {
			if (isCancelled()) return false;
			const node = this.paragraphs[i];
			const nodeRect = getNodeBoundingRect(this.document, node);
			const paragraphSize = this.verticalMode
				? nodeRect.width
				: nodeRect.height;
			const nodeLeft = formatPos(
				this.verticalMode ? nodeRect.left : nodeRect.bottom,
				this.direction,
			);
			const paragraphPos =
				paragraphSize <= 0
					? nextParagraphPos[i - 1] || 0
					: nodeLeft -
						scrollElRef -
						dimensionAdjustment +
						scrollPos +
						this.scrollPos -
						initialScrollPos;
			nextParagraphPos[i] = paragraphPos;
			const indices = paragraphPosToIndices.get(paragraphPos) || [];
			indices.push(i);
			paragraphPosToIndices.set(paragraphPos, indices);
			if (i > 0 && i % 100 === 0) await yieldToMainThread();
		}
		if (isCancelled()) return false;
		for (const [index, position] of nextParagraphPos.entries()) {
			this.paragraphPos[index] = position;
		}
		this.paragraphPosToAccCharCount = new Map(
			[...paragraphPosToIndices.entries()].map(([paragraphPos, indices]) => [
				paragraphPos,
				Math.max(...indices.map((i) => this.accumulatedCharCount[i])),
			]),
		);
		this.hasParagraphPositions = true;
		return true;
	}

	calcExploredCharCount(customReadingPointScrollOffset = 0) {
		return this.getCharCountByScrollPos(
			this.scrollPos + customReadingPointScrollOffset,
		);
	}

	/**
	 * Reads the first rendered character at the reading edge. Unlike the legacy
	 * paragraph geometry this preserves a position inside a text node that spans
	 * several screens. It is intentionally used for saves/reflows rather than
	 * every scroll event: caret hit-testing may force layout in the browser.
	 */
	calcPreciseExploredCharCount() {
		const view = this.document.defaultView;
		if (!view) return this.calcExploredCharCount();
		const viewport = this.getViewportRect();
		const contentRect = this.containerEl.getBoundingClientRect();
		const style = getComputedStyle(this.containerEl);
		const paddingTop = Number.parseFloat(style.paddingTop) || 0;
		const paddingRight = Number.parseFloat(style.paddingRight) || 0;
		const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
		const lineHeight = Math.max(8, Number.parseFloat(style.lineHeight) || 24);
		const values: number[] = [];

		if (this.verticalMode) {
			const edge =
				this.direction === "rtl"
					? viewport.right - paddingRight
					: viewport.left + paddingLeft;
			const top = Math.max(viewport.top, contentRect.top);
			const bottom = Math.min(viewport.bottom, contentRect.bottom);
			const ys = sampleBetween(top, bottom);
			for (const inset of [2, lineHeight / 2, lineHeight]) {
				const x = this.direction === "rtl" ? edge - inset : edge + inset;
				for (const y of ys) {
					const value = this.characterAtPoint(x, y);
					if (value !== undefined) values.push(value);
				}
			}
		} else {
			const edge = viewport.top + paddingTop;
			const left = Math.max(viewport.left, contentRect.left);
			const right = Math.min(viewport.right, contentRect.right);
			const xs = sampleBetween(left, right);
			for (const inset of [2, lineHeight / 2, lineHeight]) {
				for (const x of xs) {
					const value = this.characterAtPoint(x, edge + inset);
					if (value !== undefined) values.push(value);
				}
			}
		}

		if (values.length) return Math.min(...values);
		// A full-page illustration can be the first visible content while its
		// pixels start after a top/side margin. In that case caret hit-testing at
		// the reading edge sees no text at all, so select the first visible image
		// before falling back to coarse paragraph geometry.
		return this.firstVisibleImageCharacter() ?? this.calcExploredCharCount();
	}

	getCharCountByScrollPos(scrollPos: number) {
		if (!this.hasParagraphPositions) {
			// Before the background index is ready, validate a saved pixel offset
			// with logarithmic live measurements. Upper-bound search includes all
			// inline nodes sharing the same trailing edge, just like the full map.
			const readPosition = this.liveParagraphPositions();
			let low = 0;
			let high = this.paragraphs.length;
			while (low < high) {
				const mid = Math.floor((low + high) / 2);
				if (readPosition(mid) <= scrollPos) low = mid + 1;
				else high = mid;
			}
			return this.accumulatedCharCount[low - 1] ?? 0;
		}
		const index = binarySearchNoNegative(this.paragraphPos, scrollPos);
		return this.paragraphPosToAccCharCount.get(this.paragraphPos[index]) || 0;
	}

	getScrollPosByCharCount(charCount: number) {
		const index = binarySearchNoNegative(this.accumulatedCharCount, charCount);
		const position = this.hasParagraphPositions
			? this.paragraphPos[index]
			: this.liveParagraphPositions()(index);
		return formatPos(position, this.direction) || 0;
	}

	private liveParagraphPositions() {
		const { scrollElRef, dimensionAdjustment } = this.getReadingReference();
		const scrollPos = this.scrollPos;
		const positions = new Map<number, number>();
		return (index: number): number => {
			const empty: number[] = [];
			let position = 0;
			for (let i = index; i >= 0; i -= 1) {
				const cached = positions.get(i);
				if (cached !== undefined) {
					position = cached;
					break;
				}
				const rect = getNodeBoundingRect(this.document, this.paragraphs[i]);
				if ((this.verticalMode ? rect.width : rect.height) > 0) {
					position =
						formatPos(
							this.verticalMode ? rect.left : rect.bottom,
							this.direction,
						) -
						scrollElRef -
						dimensionAdjustment +
						scrollPos;
					positions.set(i, position);
					break;
				}
				empty.push(i);
			}
			for (const i of empty) positions.set(i, position);
			return position;
		};
	}

	/**
	 * Scroll position that aligns the *leading* edge of the paragraph at the
	 * reading edge for charCount flush against the reading point — measured live,
	 * against the same reference (scroll-element edge + container padding) the
	 * char count was read from.
	 *
	 * getScrollPosByCharCount() returns paragraphPos, which is the *trailing*
	 * edge of the already-read paragraph; restoring there leaves the
	 * partially-visible next paragraph pushed in by the inter-paragraph gap (a
	 * half-cut line on a writing-mode switch). Anchoring the leading edge of the
	 * paragraph you're actually on removes that gap. Falls back to the
	 * trailing-edge paragraphPos when the node can't be measured.
	 */
	getReadingEdgeScrollPos(charCount: number): number {
		const precise = this.getScrollPosForCharCount(charCount, this.rawScrollPos);
		if (precise !== undefined) return precise;

		const index = binarySearchNoNegative(this.accumulatedCharCount, charCount);
		// The node at index ends at charCount; the one you're reading into is the
		// next (fall back to the last node at the very end of the book).
		const node = this.paragraphs[index + 1] ?? this.paragraphs[index];
		if (!node) return this.getScrollPosByCharCount(charCount);

		// Node rects are viewport-relative. Add the current scroll to recover
		// the absolute reading coordinate for both route and document scrollers.
		const { scrollElRef, dimensionAdjustment } = this.getReadingReference();
		const nodeRect = getNodeBoundingRect(this.document, node);
		// Leading edge: the first line of the paragraph — rightmost in
		// vertical-rl, topmost in horizontal-tb.
		const nodeLeadingEdge = formatPos(
			this.verticalMode ? nodeRect.right : nodeRect.top,
			this.direction,
		);

		const paragraphPos =
			nodeLeadingEdge - scrollElRef - dimensionAdjustment + this.scrollPos;
		return formatPos(paragraphPos, this.direction);
	}

	/** Absolute scroll coordinate that puts an exact character at the edge. */
	getScrollPosForCharCount(
		charCount: number,
		currentScrollPos: number,
	): number | undefined {
		const point = this.characterPointForCount(charCount);
		if (!point) return undefined;
		const viewport = this.getViewportRect();
		const style = getComputedStyle(this.containerEl);
		if (this.verticalMode) {
			const padding =
				Number.parseFloat(
					this.direction === "rtl" ? style.paddingRight : style.paddingLeft,
				) || 0;
			const desired =
				this.direction === "rtl"
					? viewport.right - padding
					: viewport.left + padding;
			const rendered =
				this.direction === "rtl" ? point.rect.right : point.rect.left;
			return currentScrollPos + rendered - desired;
		}
		const paddingTop = Number.parseFloat(style.paddingTop) || 0;
		return currentScrollPos + point.rect.top - (viewport.top + paddingTop);
	}

	getCharacterRectForCount(charCount: number) {
		return this.characterPointForCount(charCount)?.rect;
	}

	private characterAtPoint(x: number, y: number): number | undefined {
		const caretDocument = this.document as Document & {
			caretPositionFromPoint?: (
				x: number,
				y: number,
			) => { offsetNode: Node; offset: number } | null;
			caretRangeFromPoint?: (x: number, y: number) => Range | null;
		};
		const position = caretDocument.caretPositionFromPoint?.(x, y);
		const node =
			position?.offsetNode.nodeType === Node.TEXT_NODE
				? (position.offsetNode as Text)
				: undefined;
		const offset = node ? position?.offset : undefined;
		const range = node ? null : caretDocument.caretRangeFromPoint?.(x, y);
		const rangeNode =
			range?.startContainer.nodeType === Node.TEXT_NODE
				? (range.startContainer as Text)
				: undefined;
		const finalNode = node ?? rangeNode;
		const finalOffset = offset ?? range?.startOffset;
		if (!finalNode || finalOffset === undefined) {
			return this.imageCharacterAtPoint(x, y);
		}
		const start = this.nodeStartCharacters.get(finalNode);
		if (start === undefined) return undefined;
		return start + countTextCharactersBeforeOffset(finalNode.data, finalOffset);
	}

	/**
	 * Caret APIs intentionally return no text node over an illustration. Images
	 * are nevertheless reader-position characters, so use hit-testing to give
	 * each rendered image its own stable coordinate.
	 */
	private imageCharacterAtPoint(x: number, y: number): number | undefined {
		const documentWithHitTest = this.document as Document & {
			elementsFromPoint?: (x: number, y: number) => Element[];
			elementFromPoint?: (x: number, y: number) => Element | null;
		};
		const candidates = documentWithHitTest.elementsFromPoint?.(x, y) ?? [
			documentWithHitTest.elementFromPoint?.(x, y),
		];
		for (const candidate of candidates) {
			if (!candidate || !isNodeImage(candidate)) continue;
			const start = this.nodeStartCharacters.get(candidate);
			if (start !== undefined) return start;
		}
		return undefined;
	}

	private firstVisibleImageCharacter(): number | undefined {
		const viewport = this.getViewportRect();
		let first: { character: number; readingCoordinate: number } | undefined;
		for (const node of this.paragraphs) {
			if (!isNodeImage(node) || !(node instanceof Element)) continue;
			const character = this.nodeStartCharacters.get(node);
			if (character === undefined) continue;
			const rect = node.getBoundingClientRect();
			const intersectsViewport =
				rect.right > viewport.left &&
				rect.left < viewport.right &&
				rect.bottom > viewport.top &&
				rect.top < viewport.bottom;
			if (!intersectsViewport) continue;
			const readingCoordinate = this.verticalMode
				? this.direction === "rtl"
					? -rect.right
					: rect.left
				: rect.top;
			if (!first || readingCoordinate < first.readingCoordinate) {
				first = { character, readingCoordinate };
			}
		}
		return first?.character;
	}

	private characterPointForCount(charCount: number) {
		if (!this.paragraphs.length) return undefined;
		let index = binarySearchNoNegative(this.accumulatedCharCount, charCount);
		if (
			index < this.paragraphs.length - 1 &&
			(this.accumulatedCharCount[index] ?? 0) <= charCount
		) {
			index += 1;
		}
		index = Math.max(0, Math.min(index, this.paragraphs.length - 1));
		const node = this.paragraphs[index];
		if (!node) return undefined;
		if (isNodeImage(node) && node instanceof Element) {
			const rect = node.getBoundingClientRect();
			return rect.width || rect.height ? { rect } : undefined;
		}
		if (node.nodeType !== Node.TEXT_NODE) return undefined;
		const text = node as Text;
		const start = this.nodeStartCharacters.get(text) ?? 0;
		const localCount = Math.max(0, charCount - start);
		const sourceOffset = sourceOffsetForCharacterCount(text.data, localCount);
		const range = this.document.createRange();
		const rangeStart = Math.min(
			sourceOffset,
			Math.max(0, text.data.length - 1),
		);
		const codePoint = text.data.codePointAt(rangeStart);
		const length = codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
		range.setStart(text, rangeStart);
		range.setEnd(text, Math.min(text.data.length, rangeStart + length));
		const rect = range.getBoundingClientRect();
		return rect.width || rect.height ? { rect } : undefined;
	}

	private getViewportRect() {
		if (
			this.scrollEl === this.document.documentElement ||
			this.scrollEl === this.document.body
		) {
			const width =
				this.document.documentElement.clientWidth ||
				this.document.defaultView?.innerWidth ||
				0;
			const height =
				this.document.documentElement.clientHeight ||
				this.document.defaultView?.innerHeight ||
				0;
			return { top: 0, left: 0, right: width, bottom: height };
		}
		return this.scrollEl.getBoundingClientRect();
	}

	private get scrollPos() {
		return formatPos(this.scrollEl[this.scrollPosProp], this.direction);
	}

	private get rawScrollPos() {
		return this.scrollEl[this.scrollPosProp];
	}

	private get scrollPosProp() {
		return this.verticalMode ? "scrollLeft" : "scrollTop";
	}
}

function sampleBetween(start: number, end: number) {
	if (end <= start) return [(start + end) / 2];
	const size = end - start;
	return [0.15, 0.35, 0.5, 0.65, 0.85].map(
		(fraction) => start + size * fraction,
	);
}

async function yieldToMainThread() {
	const scheduler = (
		globalThis as typeof globalThis & {
			scheduler?: { yield?: () => Promise<void> };
		}
	).scheduler;
	if (scheduler?.yield) await scheduler.yield();
	else await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
