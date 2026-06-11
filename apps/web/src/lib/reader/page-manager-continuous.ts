/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { viewportHeight, viewportWidth } from "./viewport";

export class PageManagerContinuous {
	constructor(
		private verticalMode: boolean,
		private firstDimensionMargin: number,
		private window: Window,
	) {}

	nextPage() {
		this.scrollByPercent(0.95);
	}

	prevPage() {
		this.scrollByPercent(-0.95);
	}

	scrollTo(pos: number) {
		this.window.scrollTo({
			[this.verticalMode ? "left" : "top"]: pos,
		});
	}

	private scrollByPercent(value: number) {
		let windowSize = viewportHeight(this.window);
		let scrollSide: "left" | "top" = "top";
		let scale = 1;

		if (this.verticalMode) {
			windowSize = viewportWidth(this.window);
			scrollSide = "left";
			scale = -1;
		}
		const pageSize = windowSize - this.firstDimensionMargin * 2;
		this.window.scrollBy({
			[scrollSide]: pageSize * value * scale,
			behavior: "smooth",
		});
	}
}
