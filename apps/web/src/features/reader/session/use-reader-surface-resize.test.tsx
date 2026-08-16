import "@/test-utils/setup-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { useReaderSurfaceResize } from "./reader-layout";

type ResizeCallback = () => void;

class TestResizeObserver {
	static instances: TestResizeObserver[] = [];
	readonly observed: Element[] = [];
	disconnected = false;

	constructor(private readonly callback: ResizeCallback) {
		TestResizeObserver.instances.push(this);
	}

	observe(element: Element) {
		this.observed.push(element);
	}

	disconnect() {
		this.disconnected = true;
	}

	emit() {
		this.callback();
	}
}

const originalResizeObserver = globalThis.ResizeObserver;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

afterEach(() => {
	cleanup();
	TestResizeObserver.instances = [];
	Object.defineProperty(globalThis, "ResizeObserver", {
		configurable: true,
		value: originalResizeObserver,
	});
	globalThis.requestAnimationFrame = originalRequestAnimationFrame;
});

function Probe({
	target,
	onResize,
}: {
	target: Element;
	onResize: () => void;
}) {
	useReaderSurfaceResize(() => target, onResize);
	return null;
}

describe("reader surface resize", () => {
	test("coalesces container measurements and disconnects on unmount", () => {
		Object.defineProperty(globalThis, "ResizeObserver", {
			configurable: true,
			value: TestResizeObserver,
		});
		globalThis.requestAnimationFrame = (callback) => {
			callback(0);
			return 1;
		};
		const target = document.createElement("main");
		let calls = 0;
		const view = render(<Probe target={target} onResize={() => calls++} />);
		const observer = TestResizeObserver.instances[0];
		if (!observer) throw new Error("Expected a resize observer");

		expect(observer.observed).toEqual([target]);
		observer.emit();
		expect(calls).toBe(1);
		view.unmount();
		expect(observer.disconnected).toBe(true);
	});
});
