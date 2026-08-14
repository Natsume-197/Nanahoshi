/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 *
 * Port of ttu's SectionCharacterStatsCalculator (paginated mode); RxJS
 * BehaviorSubject replaced with a plain getter callback.
 */

import { binarySearchNoNegative } from "./binary-search";
import { getCharacterCount } from "./character-count";
import { CharacterStatsCalculator } from "./character-stats-calculator";
import { formatPos } from "./format-pos";
import { getParagraphNodes } from "./get-paragraph-nodes";

export class SectionCharacterStatsCalculator {
	readonly charCount: number;

	private readonly sectionAccCharCounts: number[];

	private sectionIndex = -1;

	private calculator: CharacterStatsCalculator | undefined;

	constructor(
		public readonly containerEl: HTMLElement,
		public readonly sections: ReadonlyArray<Element>,
		private getVirtualScrollPos: () => number,
		private getWidth: () => number,
		private getHeight: () => number,
		private getPageGap: () => number,
		public verticalMode: boolean,
		private readonly scrollEl: HTMLElement,
		private readonly document: Document,
	) {
		const getSectionCharCount = (section: Element) => {
			const paragraphs = getParagraphNodes(section);
			return paragraphs.reduce((acc, cur) => acc + getCharacterCount(cur), 0);
		};
		let exploredCharCount = 0;
		this.sectionAccCharCounts = sections.map((section) => {
			exploredCharCount += getSectionCharCount(section);
			return exploredCharCount;
		});
		this.charCount = exploredCharCount;
	}

	updateCurrentSection(sectionIndex: number) {
		this.calculator = new CharacterStatsCalculator(
			this.containerEl,
			this.verticalMode ? "horizontal" : "vertical",
			"ltr",
			this.scrollEl,
			this.document,
		);
		this.sectionIndex = sectionIndex;
	}

	updateParagraphPos() {
		if (!this.calculator) return;
		this.calculator.updateParagraphPos(this.getVirtualScrollPos());
	}

	calcExploredCharCount() {
		const offset = this.verticalMode ? 0 : -this.screenSize;
		return this.getCharCountByScrollPos(this.getVirtualScrollPos() + offset);
	}

	calcPreciseExploredCharCount() {
		if (!this.calculator) return -1;
		return (
			this.getSectionStartCount() +
			this.calculator.calcPreciseExploredCharCount()
		);
	}

	getCharCountByScrollPos(scrollPos: number) {
		if (!this.calculator) return -1;
		const startCount = this.getSectionStartCount();
		return this.calculator.getCharCountByScrollPos(scrollPos) + startCount;
	}

	getSectionIndexByCharCount(charCount: number) {
		return binarySearchNoNegative(this.sectionAccCharCounts, charCount) + 1;
	}

	getSectionStartCharCount(sectionIndex: number) {
		return this.sectionAccCharCounts[sectionIndex - 1] || 0;
	}

	getScrollPosByCharCount(charCount: number) {
		if (!this.calculator) return -1;
		const startCount = this.getSectionStartCount();
		const endCount = this.sectionAccCharCounts[this.sectionIndex];
		const mirroredCount = charCount - startCount;
		const isEndChar = charCount === endCount && endCount - startCount > 0;
		if (mirroredCount < 0 || charCount > endCount || isEndChar) return -1;
		if (mirroredCount === 0) return 0;
		const preciseRect = this.calculator.getCharacterRectForCount(mirroredCount);
		if (preciseRect) {
			const viewportRect = this.scrollEl.getBoundingClientRect();
			const renderedOffset = this.verticalMode
				? preciseRect.top - viewportRect.top
				: preciseRect.left - viewportRect.left;
			const preciseScroll = this.getVirtualScrollPos() + renderedOffset;
			return Math.max(
				0,
				this.screenSize *
					Math.floor(Math.max(0, preciseScroll) / this.screenSize),
			);
		}

		const index = binarySearchNoNegative(
			this.calculator.accumulatedCharCount,
			mirroredCount,
		);
		const { accumulatedCharCount, paragraphPos } = this.calculator;
		const prevCharCount = accumulatedCharCount[index];
		if (Number.isNaN(Number(paragraphPos[index]))) return -1;

		const bestFitIndex = (from: number, to: number): number => {
			if (from >= to) return to;
			if (accumulatedCharCount[from] > prevCharCount) return from;
			return bestFitIndex(from + 1, to);
		};
		const scrollPos =
			paragraphPos[bestFitIndex(index + 1, accumulatedCharCount.length - 1)];

		const { screenSize } = this;
		const offsetCount = this.verticalMode ? -1 : 0;
		const screenPos =
			screenSize * (Math.ceil(scrollPos / screenSize) + offsetCount);
		return formatPos(screenPos, this.calculator.direction);
	}

	checkBookmarkOnScreen(charCount: number) {
		const scrollPos = this.getScrollPosByCharCount(charCount);
		const virtualPos = this.getVirtualScrollPos();

		if (scrollPos !== -1 && scrollPos === virtualPos && this.calculator) {
			return {
				isBookmarkScreen: true,
				...this.calculator.getBookMarkPosForSection(
					this.getSectionStartCount(),
					charCount,
				),
			};
		}

		return {
			isBookmarkScreen: scrollPos !== -1 && scrollPos === virtualPos,
			bookmarkPos: undefined,
			node: undefined,
			isFirstNode: true,
		};
	}

	private getSectionStartCount() {
		return this.getSectionStartCharCount(this.sectionIndex);
	}

	private get screenSize() {
		return (
			(this.verticalMode ? this.getHeight() : this.getWidth()) +
			this.getPageGap()
		);
	}
}
