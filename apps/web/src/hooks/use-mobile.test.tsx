import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { useIsBelowLg } from "./use-mobile";

beforeAll(() => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>");
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		Node: dom.window.Node,
		IS_REACT_ACT_ENVIRONMENT: true,
	});
	Object.defineProperty(dom.window, "matchMedia", {
		configurable: true,
		value: () => ({
			matches: true,
			addEventListener: () => {},
			removeEventListener: () => {},
		}),
	});
});

afterEach(cleanup);

function BelowLgProbe() {
	return <output>{useIsBelowLg() ? "compact" : "wide"}</output>;
}

describe("responsive player media query", () => {
	test("uses the client viewport on the first client render", () => {
		const view = render(<BelowLgProbe />);

		expect(view.getByText("compact")).toBeTruthy();
	});
});
