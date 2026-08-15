/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

export class PageManagerContinuous {
	constructor(
		private verticalMode: boolean,
		private firstDimensionMargin: number,
		private scrollEl: HTMLElement,
	) {}

	nextPage() {
		this.scrollByPercent(0.95);
	}

	prevPage() {
		this.scrollByPercent(-0.95);
	}

	scrollTo(pos: number) {
		this.scrollEl.scrollTo({
			[this.verticalMode ? "left" : "top"]: pos,
		});
	}

	private scrollByPercent(value: number) {
		let viewportSize = this.scrollEl.clientHeight;
		let scrollSide: "left" | "top" = "top";
		let scale = 1;

		if (this.verticalMode) {
			viewportSize = this.scrollEl.clientWidth;
			scrollSide = "left";
			scale = -1;
		}
		const pageSize = viewportSize - this.firstDimensionMargin * 2;
		this.scrollEl.scrollBy({
			[scrollSide]: pageSize * value * scale,
			behavior: "smooth",
		});
	}
}
