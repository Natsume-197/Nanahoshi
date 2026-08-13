import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { ReadListenActiveCueFollower } from "./read-listen-active-cue-follower";

const scrollToIndex = mock(() => {});

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
		value: () => ({ matches: false }),
	});
});

afterEach(() => {
	cleanup();
	scrollToIndex.mockClear();
});

describe("PlayerReadListenPanel following", () => {
	test("positions immediately and re-centers the same cue after a resize", async () => {
		const view = render(
			<ReadListenActiveCueFollower
				active={{ id: "current", index: 18 }}
				layoutRevision={640}
				scrollToIndex={scrollToIndex}
			/>,
		);

		await waitFor(() => expect(scrollToIndex).toHaveBeenCalledTimes(1));
		expect(scrollToIndex).toHaveBeenLastCalledWith(18, {
			align: "center",
			behavior: "auto",
		});

		view.rerender(
			<ReadListenActiveCueFollower
				active={{ id: "current", index: 18 }}
				layoutRevision={480}
				scrollToIndex={scrollToIndex}
			/>,
		);

		await waitFor(() => expect(scrollToIndex).toHaveBeenCalledTimes(2));
		expect(scrollToIndex).toHaveBeenLastCalledWith(18, {
			align: "center",
			behavior: "auto",
		});
	});
});
