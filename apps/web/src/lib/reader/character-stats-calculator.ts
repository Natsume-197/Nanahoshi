/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { binarySearch, binarySearchNoNegative } from "./binary-search";
import { getCharacterCount } from "./character-count";
import { formatPos } from "./format-pos";
import { getParagraphNodes } from "./get-paragraph-nodes";
import { getNodeBoundingRect } from "./range-util";

export class CharacterStatsCalculator {
	readonly charCount: number;

	readonly accumulatedCharCount: number[];

	readonly paragraphPos: number[];

	private readonly paragraphs: Node[];

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

	calcExploredCharCount(customReadingPointScrollOffset = 0) {
		return this.getCharCountByScrollPos(
			this.scrollPos + customReadingPointScrollOffset,
		);
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

	private get scrollPosProp() {
		return this.verticalMode ? "scrollLeft" : "scrollTop";
	}
}
