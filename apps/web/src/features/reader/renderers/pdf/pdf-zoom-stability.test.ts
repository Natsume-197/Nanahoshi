import "@/test-utils/setup-dom";

import { describe, expect, mock, test } from "bun:test";
import {
	createSettledZoom,
	createZoomScrollSync,
	dampedWheelDelta,
	dampWheelZoom,
} from "./pdf-zoom-stability";

// jsdom has WheelEvent on window only; the module constructs one while forwarding.
globalThis.WheelEvent ??= window.WheelEvent;

type Listener = (event: {
	newZoom: number;
	center: { vx: number; vy: number };
	desiredScrollLeft: number;
	desiredScrollTop: number;
}) => void;

function fakeZoom() {
	const listeners = new Set<Listener>();
	return {
		onZoomChange: (listener: Listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		emit: (newZoom: number, top = 0) => {
			for (const listener of listeners)
				listener({
					newZoom,
					desiredScrollLeft: 0,
					desiredScrollTop: top,
					center: { vx: 500, vy: 400 },
				});
		},
	};
}

describe("dampedWheelDelta", () => {
	test("a mouse notch zooms ~15% instead of doubling", () => {
		expect(dampedWheelDelta(-100, 0)).toBe(-15);
		expect(dampedWheelDelta(120, 0)).toBe(15);
	});

	test("trackpad deltas pass through; line-mode wheels are converted", () => {
		expect(dampedWheelDelta(-4, 0)).toBe(-4);
		expect(dampedWheelDelta(-3, 1)).toBe(-15);
	});
});

test("dampWheelZoom hands EmbedPDF a damped ctrl-wheel and leaves plain scrolling alone", () => {
	const container = document.createElement("div");
	const seen = mock((_event: WheelEvent) => {});
	container.addEventListener("wheel", (event) => seen(event as WheelEvent));
	const stop = dampWheelZoom(container);

	container.dispatchEvent(
		new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, cancelable: true }),
	);
	container.dispatchEvent(new WheelEvent("wheel", { deltaY: 300 }));

	expect(seen.mock.calls.map(([event]) => event.deltaY)).toEqual([-15, 300]);
	stop();
});

describe("createSettledZoom", () => {
	test("a single step renders at once; a burst renders only its last step", () => {
		let clock = 0;
		const zoom = fakeZoom();
		const settled = createSettledZoom(1, 200, () => clock);
		settled.connect(zoom);

		zoom.emit(1.1);
		expect(settled.get()).toBe(1.1);

		clock = 50;
		zoom.emit(1.2);
		clock = 100;
		zoom.emit(1.3);
		expect(settled.get()).toBe(1.1);
	});

	test("the burst's final zoom lands once it goes quiet", async () => {
		let clock = 0;
		const zoom = fakeZoom();
		const settled = createSettledZoom(1, 10, () => clock);
		settled.connect(zoom);
		zoom.emit(1.1);
		clock = 5;
		zoom.emit(1.4);

		await new Promise((resolve) => setTimeout(resolve, 30));

		expect(settled.get()).toBe(1.4);
	});
});

const rect = (left: number, top: number, width: number, height: number) =>
	({
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		x: left,
		y: top,
	}) as DOMRect;

/** A viewport with one page whose box the test moves around, like a zoom would. */
function fakeViewport() {
	const viewport = document.createElement("div");
	const page = document.createElement("div");
	page.dataset.readerPdfPage = "321";
	viewport.append(page);
	const box = { top: 0, left: 0, width: 500, height: 800, layoutWidth: 500 };
	viewport.getBoundingClientRect = () => rect(0, 0, 1000, 800);
	// jsdom has no layout; the page box follows scrollTop like a real one.
	page.getBoundingClientRect = () =>
		rect(
			box.left - viewport.scrollLeft,
			box.top - viewport.scrollTop,
			box.width,
			box.height,
		);
	Object.defineProperty(page, "offsetWidth", { get: () => box.layoutWidth });
	return { viewport, box };
}

describe("createZoomScrollSync", () => {
	test("the page point under the focus stays put once the pages grow", () => {
		const frames: (() => void)[] = [];
		const zoom = fakeZoom();
		const sync = createZoomScrollSync((callback) => frames.push(callback));
		const { viewport, box } = fakeViewport();
		box.top = 100; // the focus (y 400) sits 3/8 down the page
		sync.connect(zoom, viewport);

		zoom.emit(2, 0);
		sync.apply(null); // React detaches the old ref first
		sync.apply(viewport);
		// Page doubles in the next commit; header padding and gaps don't scale.
		Object.assign(box, {
			top: 250,
			width: 1000,
			height: 1600,
			layoutWidth: 1000,
		});
		frames.shift()?.();

		const page = viewport.querySelector("div")?.getBoundingClientRect();
		expect((page?.top ?? 0) + (3 / 8) * (page?.height ?? 0)).toBeCloseTo(400);
	});

	test("the wheel preview's near-final size doesn't count as the resize", () => {
		const frames: (() => void)[] = [];
		const zoom = fakeZoom();
		const sync = createZoomScrollSync((callback) => frames.push(callback));
		const { viewport, box } = fakeViewport();
		// EmbedPDF's CSS preview already shows the page at its final size.
		Object.assign(box, { width: 1000, height: 1600 });
		sync.connect(zoom, viewport);
		zoom.emit(2, 0);
		sync.apply(viewport);

		frames.shift()?.();
		expect(viewport.scrollTop).toBe(0);
		// The real resize lands a frame later; only now is the anchor restored.
		Object.assign(box, { top: 300, layoutWidth: 1000 });
		frames.shift()?.();
		expect(viewport.scrollTop).toBe(300);
	});
});
