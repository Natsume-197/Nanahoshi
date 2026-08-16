/** Internal mechanics shared by continuous text layout and paginated measures. */
export function formatPos(position: number, direction: "ltr" | "rtl"): number {
	return direction === "rtl" ? -position : position;
}

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

export function horizontalMouseWheel(
	smooth: number,
	target: HTMLElement,
	animationCb: typeof requestAnimationFrame,
) {
	const scrollFn = buildSmoothScroll(target, animationCb)(smooth, "scrollLeft");

	return (event: WheelEvent, fontSize: number, innerWidth: number) => {
		if (!isVerticalScroll(event)) return;
		scrollFn(-getScrollDistance(event, fontSize, innerWidth));
		event.preventDefault();
	};
}

function isVerticalScroll(event: WheelEvent) {
	return !(
		!event.deltaY ||
		event.deltaX ||
		event.altKey ||
		event.shiftKey ||
		event.ctrlKey ||
		event.metaKey
	);
}

function getScrollDistance(
	event: WheelEvent,
	fontSize: number,
	innerWidth: number,
) {
	switch (event.deltaMode) {
		case 0:
			return event.deltaY;
		case 1:
			return event.deltaY * fontSize * 1.75;
		default:
			return event.deltaY * innerWidth;
	}
}

// https://stackoverflow.com/a/47206289
function buildSmoothScroll(
	target: HTMLElement,
	animationCb: typeof requestAnimationFrame,
) {
	return (smooth: number, scrollAxis: "scrollLeft" | "scrollTop") => {
		let moving = false;
		let targetPos = target[scrollAxis];
		let expectedPos = target[scrollAxis];
		const update = () => {
			moving = true;
			const delta = Math.trunc((targetPos - target[scrollAxis]) / smooth);
			if (target[scrollAxis] !== expectedPos) {
				moving = false;
				return;
			}
			expectedPos += delta;
			target.scrollBy(delta, 0);
			if (Math.abs(delta) > 0) {
				animationCb(update);
				return;
			}
			moving = false;
		};
		return (delta: number) => {
			if (!moving) {
				targetPos = target[scrollAxis];
				expectedPos = target[scrollAxis];
			}
			targetPos += delta;
			if (!moving) animationCb(update);
		};
	};
}

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
			return;
		}
		this.enabled = true;
		this.prevTick = Date.now();
		this.acc = 0;
		this.rafId = requestAnimationFrame(this.tick);
		this.onToggle?.(true);
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
			this.scrollEl.scrollBy({
				[this.verticalMode ? "left" : "top"]: intX,
			});
		}
		this.rafId = requestAnimationFrame(this.tick);
	};

	private calcNewPos(prevTick: number, curTick: number) {
		const scrollScale = this.verticalMode ? -0.00091489 : 0.00365956;
		return scrollScale * this.multiplier * (curTick - prevTick);
	}
}
