interface ZoomChange {
	newZoom: number;
	/** Focus point in viewport coordinates. */
	center?: { vx: number; vy: number };
	desiredScrollLeft: number;
	desiredScrollTop: number;
}

interface ZoomEvents {
	onZoomChange: (listener: (event: ZoomChange) => void) => () => void;
}

// A mouse notch reports ~100 and EmbedPDF scales by 1 − deltaY·0.01, doubling
// the zoom per notch. Trackpads send small deltas and stay untouched.
const MAX_WHEEL_ZOOM_DELTA = 15;
const LINE_HEIGHT_PX = 16;

export function dampedWheelDelta(deltaY: number, deltaMode: number) {
	const pixels = deltaMode === 1 ? deltaY * LINE_HEIGHT_PX : deltaY;
	return Math.max(
		-MAX_WHEEL_ZOOM_DELTA,
		Math.min(MAX_WHEEL_ZOOM_DELTA, pixels),
	);
}

/**
 * Re-dispatches ctrl/⌘-wheel events with a damped delta before EmbedPDF's own
 * gesture handler sees them, keeping its smooth transform preview.
 */
export function dampWheelZoom(container: HTMLElement): () => void {
	const forwarded = new WeakSet<Event>();
	const onWheel = (event: WheelEvent) => {
		if (!(event.ctrlKey || event.metaKey) || forwarded.has(event)) return;
		const deltaY = dampedWheelDelta(event.deltaY, event.deltaMode);
		if (deltaY === event.deltaY && event.deltaMode === 0) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		const damped = new WheelEvent("wheel", {
			deltaY,
			deltaMode: 0,
			ctrlKey: event.ctrlKey,
			metaKey: event.metaKey,
			clientX: event.clientX,
			clientY: event.clientY,
			bubbles: true,
			cancelable: true,
		});
		forwarded.add(damped);
		container.dispatchEvent(damped);
	};
	container.addEventListener("wheel", onWheel, {
		capture: true,
		passive: false,
	});
	return () =>
		container.removeEventListener("wheel", onWheel, { capture: true });
}

/**
 * The zoom pages render at. A lone step applies at once; steps arriving in a
 * burst (held keys, repeated presses) only apply once it settles, so pages stay
 * CSS-stretched instead of starting PDFium renders that can't be cancelled.
 */
export function createSettledZoom(
	initial: number,
	burstMs = 220,
	now: () => number = () => performance.now(),
) {
	let value = initial;
	let lastChange = Number.NEGATIVE_INFINITY;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const listeners = new Set<() => void>();
	const set = (next: number) => {
		if (next === value) return;
		value = next;
		for (const listener of listeners) listener();
	};
	return {
		get: () => value,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		connect(zoom: ZoomEvents) {
			const stop = zoom.onZoomChange((event) => {
				const inBurst = now() - lastChange < burstMs;
				lastChange = now();
				clearTimeout(timer);
				if (!inBurst) {
					set(event.newZoom);
					return;
				}
				timer = setTimeout(() => set(event.newZoom), burstMs);
			});
			return () => {
				stop();
				clearTimeout(timer);
			};
		},
	};
}

export interface PdfPageAnchor {
	page: string;
	/** Position inside the page box, 0–1 on each axis. */
	fx: number;
	fy: number;
	/** The client point that must keep showing it. */
	x: number;
	y: number;
}

const PAGE_SELECTOR = "[data-reader-pdf-page]";

/** The page point under a client point (the nearest page when it falls in a gap). */
export function capturePageAnchor(
	viewport: HTMLElement,
	point: { x: number; y: number },
): PdfPageAnchor | undefined {
	let best: { element: HTMLElement; rect: DOMRect } | undefined;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const element of viewport.querySelectorAll<HTMLElement>(PAGE_SELECTOR)) {
		const rect = element.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) continue;
		const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
		const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
		if (dx + dy < bestDistance) {
			bestDistance = dx + dy;
			best = { element, rect };
		}
	}
	if (!best) return undefined;
	const { element, rect } = best;
	return {
		page: element.dataset.readerPdfPage ?? "",
		fx: (point.x - rect.left) / rect.width,
		fy: (point.y - rect.top) / rect.height,
		x: point.x,
		y: point.y,
	};
}

/** Scrolls so the anchored page point sits back under its client point. */
export function restorePageAnchor(
	viewport: HTMLElement,
	anchor: PdfPageAnchor,
): boolean {
	const element = viewport.querySelector<HTMLElement>(
		`[data-reader-pdf-page="${anchor.page}"]`,
	);
	if (!element) return false;
	const rect = element.getBoundingClientRect();
	viewport.scrollLeft += rect.left + anchor.fx * rect.width - anchor.x;
	viewport.scrollTop += rect.top + anchor.fy * rect.height - anchor.y;
	return true;
}

/**
 * Keeps the page point under the zoom focus exactly in place. EmbedPDF's own
 * scroll target assumes all content scales, but page gaps and the header
 * padding don't, so each step drifted a few pixels; it also lands one frame
 * late. The zoom commit and the page resize arrive in different React commits,
 * so the target is applied right away and the exact anchor is restored in the
 * first frame where the page has its new size (before paint), then once more
 * to override EmbedPDF's late scroll.
 */
export function createZoomScrollSync(
	requestFrame: (callback: () => void) => number = requestAnimationFrame,
	cancelFrame: (handle: number) => void = cancelAnimationFrame,
	maxFrames = 12,
) {
	let pending:
		| { anchor?: PdfPageAnchor; width: number; left: number; top: number }
		| undefined;
	let frame = 0;
	// Layout width ignores EmbedPDF's wheel-preview transform, which already
	// shows (almost) the final size before the pages really resize.
	const widthOf = (viewport: HTMLElement, page: string) =>
		viewport.querySelector<HTMLElement>(`[data-reader-pdf-page="${page}"]`)
			?.offsetWidth ?? 0;
	return {
		connect(zoom: ZoomEvents, viewport: HTMLElement) {
			const stop = zoom.onZoomChange((event) => {
				const box = viewport.getBoundingClientRect();
				const focus = event.center ?? {
					vx: viewport.clientWidth / 2,
					vy: viewport.clientHeight / 2,
				};
				const anchor = capturePageAnchor(viewport, {
					x: box.left + focus.vx,
					y: box.top + focus.vy,
				});
				pending = {
					anchor,
					width: anchor ? widthOf(viewport, anchor.page) : 0,
					left: event.desiredScrollLeft,
					top: event.desiredScrollTop,
				};
			});
			return () => {
				stop();
				cancelFrame(frame);
			};
		},
		apply(viewport: HTMLElement | null) {
			// React detaches the previous ref with null first; keep the target for the element.
			if (!viewport) return;
			const target = pending;
			pending = undefined;
			if (!viewport || !target) return;
			viewport.scrollLeft = target.left;
			viewport.scrollTop = target.top;
			const { anchor } = target;
			if (!anchor) return;
			cancelFrame(frame);
			let frames = 0;
			let settledFrames = 0;
			const settle = () => {
				frames += 1;
				const resized =
					Math.abs(widthOf(viewport, anchor.page) - target.width) > 0.5;
				if (resized) {
					restorePageAnchor(viewport, anchor);
					settledFrames += 1;
				}
				if (settledFrames < 2 && frames < maxFrames)
					frame = requestFrame(settle);
			};
			frame = requestFrame(settle);
		},
	};
}
