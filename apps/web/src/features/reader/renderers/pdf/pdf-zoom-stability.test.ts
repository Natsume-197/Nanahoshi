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
				listener({ newZoom, desiredScrollLeft: 0, desiredScrollTop: top });
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

test("createZoomScrollSync applies the zoom's scroll target once, in the resize commit", () => {
	const zoom = fakeZoom();
	const sync = createZoomScrollSync();
	sync.connect(zoom);
	const viewport = document.createElement("div");
	zoom.emit(2, 480);

	sync.apply(viewport);
	expect(viewport.scrollTop).toBe(480);
	viewport.scrollTop = 10;
	sync.apply(viewport);
	expect(viewport.scrollTop).toBe(10);
});
