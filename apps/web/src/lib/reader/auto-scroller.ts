/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 *
 * Port notes: RxJS interval/pairwise pipeline replaced with a plain
 * requestAnimationFrame loop with identical scroll math.
 */

export class AutoScrollerContinuous {
	enabled = false;

	private rafId: number | undefined;

	private prevTick = 0;

	private acc = 0;

	private onToggle?: (enabled: boolean) => void;

	constructor(
		public multiplier: number,
		public verticalMode: boolean,
		private scrollEl: HTMLElement,
	) {}

	setToggleListener(listener: (enabled: boolean) => void) {
		this.onToggle = listener;
	}

	toggle() {
		if (this.enabled) {
			this.off();
		} else {
			this.enabled = true;
			this.prevTick = Date.now();
			this.acc = 0;
			this.rafId = requestAnimationFrame(this.tick);
			this.onToggle?.(true);
		}
	}

	off() {
		this.enabled = false;
		if (this.rafId !== undefined) {
			cancelAnimationFrame(this.rafId);
			this.rafId = undefined;
		}
		this.onToggle?.(false);
	}

	destroy() {
		this.off();
		this.onToggle = undefined;
	}

	private tick = () => {
		if (!this.enabled) return;

		const curTick = Date.now();
		this.acc += this.calcNewPos(this.prevTick, curTick);
		this.prevTick = curTick;

		const intX = Math.trunc(this.acc);
		this.acc -= intX;

		if (intX !== 0) {
			const scrollDirection: "left" | "top" = this.verticalMode
				? "left"
				: "top";
			this.scrollEl.scrollBy({ [scrollDirection]: intX });
		}

		this.rafId = requestAnimationFrame(this.tick);
	};

	private calcNewPos(prevTick: number, curTick: number) {
		let scrollScale = 0.00365956;

		if (this.verticalMode) {
			scrollScale = -0.00091489;
		}
		return scrollScale * this.multiplier * (curTick - prevTick);
	}
}
