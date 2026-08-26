import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type { ReactNode } from "react";
import { ProgressiveSectionFooter } from "./progressive-section-footer";

type ObserverOptions = IntersectionObserverInit | undefined;

let observerOptions: ObserverOptions;

class IntersectionObserverMock {
	constructor(
		_callback: IntersectionObserverCallback,
		options?: IntersectionObserverInit,
	) {
		observerOptions = options;
	}

	disconnect = mock(() => {});
	observe = mock((_target: Element) => {});
	unobserve = mock((_target: Element) => {});
	takeRecords = mock(() => []);
	root = null;
	rootMargin = "0px";
	thresholds = [0];
}

beforeAll(() => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>");
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		Element: dom.window.Element,
		HTMLElement: dom.window.HTMLElement,
		Node: dom.window.Node,
		IntersectionObserver: IntersectionObserverMock,
		requestAnimationFrame: mock((_callback: FrameRequestCallback) => 1),
		cancelAnimationFrame: mock(() => {}),
		IS_REACT_ACT_ENVIRONMENT: true,
	});
});

afterEach(() => {
	cleanup();
	observerOptions = undefined;
});

function DashboardScrollPanel({ children }: { children: ReactNode }) {
	return <main id="dashboard-main">{children}</main>;
}

describe("ProgressiveSectionFooter", () => {
	test("prefetches relative to the dashboard scroll panel", async () => {
		const view = render(
			<ProgressiveSectionFooter loading={false} observe onVisible={() => {}} />,
			{ wrapper: DashboardScrollPanel },
		);

		await waitFor(() => expect(observerOptions).toBeDefined());
		expect(
			observerOptions?.root === view.container.querySelector("#dashboard-main"),
		).toBe(true);
		expect(observerOptions?.rootMargin).toBe("3200px 0px");
	});
});
