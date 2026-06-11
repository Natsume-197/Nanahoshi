/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 *
 * Port of ttu's PageManagerPaginated; RxJS subjects replaced with callbacks.
 * Section switches are async (the host re-renders the section's HTML), so
 * `requestSection` resolves once the host reports the render via
 * `notifySectionRendered`.
 */

import type { Section } from "./types";

export type SectionWithProgress = Section & { progress: number };

export interface PaginatedHost {
	getVirtualScrollPos(): number;
	setVirtualScrollPos(pos: number): void;
	getSectionIndex(): number;
	/** Ask the host to render another section; the host calls back when done. */
	requestSection(index: number, onRendered: () => void): void;
	onPageChange(isUser: boolean): void;
	onSectionProgress(progress: Map<string, SectionWithProgress>): void;
}

export class PageManagerPaginated {
	private translateX = 0;

	private sectionData = new Map<string, SectionWithProgress>();

	constructor(
		private contentEl: HTMLElement,
		private scrollEl: HTMLElement,
		private sections: Element[],
		sectionLabels: Section[],
		private getWidth: () => number,
		private getHeight: () => number,
		private pageGap: number,
		private verticalMode: boolean,
		private host: PaginatedHost,
	) {
		for (const section of sectionLabels) {
			this.sectionData.set(section.reference, { ...section, progress: 0 });
		}
		this.host.onSectionProgress(new Map(this.sectionData));
	}

	nextPage() {
		this.flipPage(1);
	}

	prevPage() {
		this.flipPage(-1);
	}

	flipPage(multiplier: 1 | -1) {
		const scrollSizeProp = this.verticalMode ? "scrollHeight" : "scrollWidth";
		const viewportSize = this.verticalMode ? this.getHeight() : this.getWidth();

		const offset = viewportSize + this.pageGap;
		const isUser = true;

		if (this.translateX) {
			const clearTranslateX = () => {
				this.contentEl.style.removeProperty("transform");
				this.translateX = 0;
			};

			if (multiplier < 0) {
				const prevTranslateX = this.translateX;
				clearTranslateX();
				this.scrollToPos(-prevTranslateX - offset, isUser);
				return;
			}

			if (this.nextSection(isUser)) {
				clearTranslateX();
			}
			return;
		}

		const minValue = 0;
		const maxValue = this.scrollEl[scrollSizeProp];
		const currentValue = this.host.getVirtualScrollPos();
		const newValue = currentValue + offset * multiplier;
		const newValueCeil = Math.ceil(newValue);

		if (newValueCeil < minValue) {
			if (currentValue !== minValue) {
				this.scrollToPos(minValue, isUser);
				return;
			}

			this.prevSection(offset, scrollSizeProp, viewportSize, isUser);
			return;
		}
		if (newValueCeil >= maxValue) {
			this.nextSection(isUser);
			return;
		}

		this.scrollOrTranslateToPos(newValue, maxValue, viewportSize, isUser);
	}

	scrollTo(scrollPos: number, isUser: boolean) {
		const scrollSizeProp = this.verticalMode ? "scrollHeight" : "scrollWidth";
		const viewportSize = this.verticalMode ? this.getHeight() : this.getWidth();
		this.scrollOrTranslateToPos(
			scrollPos,
			this.scrollEl[scrollSizeProp],
			viewportSize,
			isUser,
		);
	}

	clearTranslate() {
		this.contentEl.style.removeProperty("transform");
		this.translateX = 0;
	}

	private prevSection(
		offset: number,
		scrollSizeProp: "scrollWidth" | "scrollHeight",
		viewportSize: number,
		isUser: boolean,
	) {
		const nextPage = this.host.getSectionIndex() - 1;
		if (nextPage < 0) return false;

		this.host.requestSection(nextPage, () => {
			const scrollSize = this.scrollEl[scrollSizeProp];
			let scrollValue = offset * (Math.ceil(scrollSize / offset) - 1);
			if (Math.ceil(scrollValue) >= scrollSize) {
				scrollValue -= offset;
			}
			this.scrollOrTranslateToPos(
				scrollValue,
				scrollSize,
				viewportSize,
				isUser,
			);
		});
		return true;
	}

	private nextSection(isUser: boolean) {
		const nextPage = this.host.getSectionIndex() + 1;
		if (nextPage >= this.sections.length) return false;

		this.host.requestSection(nextPage, () => {
			this.scrollToPos(0, isUser);
			this.updateSectionData(this.sections[nextPage - 1]?.id, 100, false);
			this.updateSectionData(this.sections[nextPage]?.id, 0);
		});
		return true;
	}

	private scrollOrTranslateToPos(
		pos: number,
		scrollSize: number,
		viewportSize: number,
		isUser: boolean,
	) {
		this.updateSectionData(
			this.sections[this.host.getSectionIndex()]?.id,
			(pos / scrollSize) * 100,
		);

		if (this.verticalMode) {
			this.scrollToPos(pos, isUser);
			return;
		}

		const screenRight = pos + viewportSize;
		if (screenRight <= scrollSize) {
			this.scrollToPos(pos, isUser);
			return;
		}
		this.translateXToPos(-pos, isUser);
	}

	private scrollToPos(pos: number, isUser: boolean) {
		this.host.setVirtualScrollPos(pos);
		this.scrollEl.scrollTo({ [this.verticalMode ? "top" : "left"]: pos });
		this.host.onPageChange(isUser);
	}

	private translateXToPos(pos: number, isUser: boolean) {
		this.host.setVirtualScrollPos(-pos);
		this.contentEl.style.transform = `translateX(${pos}px)`;
		this.translateX = pos;
		this.host.onPageChange(isUser);
	}

	private updateSectionData(ref: string, progress: number, emit = true) {
		if (!ref || !this.sectionData.has(ref)) return;

		let currentRefSeen = false;

		for (const section of this.sectionData.values()) {
			const entry = this.sectionData.get(section.reference);
			if (!entry) continue;
			const isCurrentRef = section.reference === ref;

			if (isCurrentRef) {
				entry.progress = progress;
			} else if (currentRefSeen) {
				entry.progress = 0;
			} else {
				entry.progress = 100;
			}

			if (!currentRefSeen && isCurrentRef) {
				currentRefSeen = true;
			}
			this.sectionData.set(section.reference, entry);
		}

		if (emit) {
			this.host.onSectionProgress(new Map(this.sectionData));
		}
	}
}
