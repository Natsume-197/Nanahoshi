interface ZoomChange {
	newZoom: number;
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

/**
 * EmbedPDF applies a zoom's scroll target one animation frame after the pages
 * resize, so for a frame the old offset shows the wrong region (often a blank
 * gap). Remember the target and apply it in the commit that resizes the pages.
 */
export function createZoomScrollSync() {
	let pending: { left: number; top: number } | undefined;
	return {
		connect(zoom: ZoomEvents) {
			return zoom.onZoomChange((event) => {
				pending = {
					left: event.desiredScrollLeft,
					top: event.desiredScrollTop,
				};
			});
		},
		apply(viewport: HTMLElement | null) {
			if (!viewport || !pending) return;
			viewport.scrollLeft = pending.left;
			viewport.scrollTop = pending.top;
			pending = undefined;
		},
	};
}
