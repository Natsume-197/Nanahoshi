/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { binarySearch, binarySearchNoNegative } from "./binary-search";
import {
	countTextCharactersBeforeOffset,
	getCharacterCount,
	sourceOffsetForCharacterCount,
} from "./character-count";
import { formatPos } from "./format-pos";
import { getParagraphNodes } from "./get-paragraph-nodes";
import { getNodeBoundingRect } from "./range-util";

export class CharacterStatsCalculator {
	readonly charCount: number;

	readonly accumulatedCharCount: number[];

	readonly paragraphPos: number[];

	private readonly paragraphs: Node[];

	private readonly nodeStartCharacters = new Map<Node, number>();

	private paragraphPosToAccCharCount = new Map<number, number>();

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
		const scrollElRect = this.scrollEl.getBoundingClientRect();
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
	}

	/**
	 * Rebuilds paragraph geometry in small tasks. Live setting changes can touch
	 * tens of thousands of text nodes; yielding prevents the final debounced
	 * relayout from becoming one proportional main-thread stall.
	 */
	async updateParagraphPosCooperative(
		scrollPos = 0,
		isCancelled: () => boolean = () => false,
	) {
		const { scrollElRef, dimensionAdjustment } = this.getReadingReference();
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
					: nodeLeft - scrollElRef - dimensionAdjustment + scrollPos;
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
	 * several screens. It is intentionally used for bookmarks/reflows rather than
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

		return values.length ? Math.min(...values) : this.calcExploredCharCount();
	}

	getCharCountByScrollPos(scrollPos: number) {
		const index = binarySearchNoNegative(this.paragraphPos, scrollPos);
		return this.paragraphPosToAccCharCount.get(this.paragraphPos[index]) || 0;
	}

	getScrollPosByCharCount(charCount: number) {
		const index = binarySearchNoNegative(this.accumulatedCharCount, charCount);
		return formatPos(this.paragraphPos[index], this.direction) || 0;
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

		// (nodeLeadingEdge - scrollElRef) is scroll-invariant — both rects shift
		// together when the document scrolls — so it already gives the absolute
		// scroll target; do NOT add the current scroll (that double-counts it).
		// This mirrors updateParagraphPos's coordinate convention.
		const { scrollElRef, dimensionAdjustment } = this.getReadingReference();
		const nodeRect = getNodeBoundingRect(this.document, node);
		// Leading edge: the first line of the paragraph — rightmost in
		// vertical-rl, topmost in horizontal-tb.
		const nodeLeadingEdge = formatPos(
			this.verticalMode ? nodeRect.right : nodeRect.top,
			this.direction,
		);

		const paragraphPos = nodeLeadingEdge - scrollElRef - dimensionAdjustment;
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
		if (!finalNode || finalOffset === undefined) return undefined;
		const start = this.nodeStartCharacters.get(finalNode);
		if (start === undefined) return undefined;
		return start + countTextCharactersBeforeOffset(finalNode.data, finalOffset);
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
		if (!node || node.nodeType !== Node.TEXT_NODE) return undefined;
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

	getBookMarkPosForSection(startCount: number, charCount: number) {
		const index = Math.max(
			0,
			binarySearch(this.accumulatedCharCount, charCount - startCount),
		);

		let finalIndex = index;
		let bookmarkPos = this.processSectionBookmarkIteration(
			index,
			startCount,
			charCount,
		);

		if (!bookmarkPos) {
			for (
				let i = index + 1, { length } = this.accumulatedCharCount;
				i < length;
				i += 1
			) {
				bookmarkPos = this.processSectionBookmarkIteration(
					i,
					startCount,
					charCount,
				);

				if (bookmarkPos) {
					finalIndex = i;
					break;
				}
			}
		}

		return {
			bookmarkPos,
			node: bookmarkPos ? this.paragraphs[finalIndex] : undefined,
			isFirstNode: finalIndex === 0,
		};
	}

	private processSectionBookmarkIteration(
		index: number,
		startCount: number,
		charCount: number,
	) {
		const currentCharSum = this.accumulatedCharCount[index] + startCount;

		let bookmarkPos: { top?: number; left?: number } | undefined;

		if (currentCharSum > charCount) {
			let container = this.paragraphs[index];

			if (container.parentElement) {
				container =
					container.parentElement.closest("p") || container.parentElement;
			}

			const { top, right, left } = getNodeBoundingRect(
				this.document,
				container,
			);

			bookmarkPos =
				this.axis === "horizontal" ? { left: right } : { top, left };
		}

		return bookmarkPos;
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
