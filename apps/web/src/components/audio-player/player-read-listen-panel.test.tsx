import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { useLayoutEffect, useRef } from "react";

let ReadListenActiveCueFollower: typeof import("./read-listen-active-cue-follower").ReadListenActiveCueFollower;

const scrollToIndex = mock(() => {});

beforeAll(async () => {
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
	({ ReadListenActiveCueFollower } = await import(
		"./read-listen-active-cue-follower"
	));
});

afterEach(() => {
	cleanup();
	scrollToIndex.mockClear();
});

describe("PlayerReadListenPanel following", () => {
	test("positions the active cue before the browser can paint the next sentence", () => {
		let callsSeenDuringCommit = -1;
		function CommitProbe() {
			const viewportRef = useRef<HTMLDivElement>(null);
			useLayoutEffect(() => {
				callsSeenDuringCommit = scrollToIndex.mock.calls.length;
			});
			return (
				<div ref={viewportRef}>
					<ReadListenActiveCueFollower
						active={{ id: "next", index: 19 }}
						layoutRevision={640}
						scrollToIndex={scrollToIndex}
						viewportRef={viewportRef}
					/>
				</div>
			);
		}

		render(<CommitProbe />);

		expect(callsSeenDuringCommit).toBe(1);
	});

	test("positions immediately and re-centers the same cue after a resize", async () => {
		const viewportRef = { current: document.createElement("div") };
		const view = render(
			<ReadListenActiveCueFollower
				active={{ id: "current", index: 18 }}
				layoutRevision={640}
				scrollToIndex={scrollToIndex}
				viewportRef={viewportRef}
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
				viewportRef={viewportRef}
			/>,
		);

		await waitFor(() => expect(scrollToIndex).toHaveBeenCalledTimes(2));
		expect(scrollToIndex).toHaveBeenLastCalledWith(18, {
			align: "center",
			behavior: "auto",
		});
	});

	test("does not reposition on playback renders while the cue is unchanged", async () => {
		const viewportRef = { current: document.createElement("div") };
		const view = render(
			<ReadListenActiveCueFollower
				active={{ id: "current", index: 18 }}
				layoutRevision={640}
				scrollToIndex={scrollToIndex}
				viewportRef={viewportRef}
			/>,
		);

		await waitFor(() => expect(scrollToIndex).toHaveBeenCalledTimes(1));
		view.rerender(
			<ReadListenActiveCueFollower
				active={{ id: "current", index: 18 }}
				layoutRevision={640}
				scrollToIndex={(index, options) => scrollToIndex(index, options)}
				viewportRef={viewportRef}
			/>,
		);

		expect(scrollToIndex).toHaveBeenCalledTimes(1);
	});

	test("follows a rendered cue without rebasing the virtualizer", () => {
		const viewport = document.createElement("div");
		const current = document.createElement("div");
		current.dataset.readListenCueId = "current";
		const next = document.createElement("div");
		next.dataset.readListenCueId = "next";
		const scrollIntoView = mock(() => {});
		next.scrollIntoView = scrollIntoView;
		viewport.append(current, next);
		const viewportRef = { current: viewport };
		const view = render(
			<ReadListenActiveCueFollower
				active={{ id: "current", index: 18 }}
				layoutRevision={640}
				scrollToIndex={scrollToIndex}
				viewportRef={viewportRef}
			/>,
		);

		view.rerender(
			<ReadListenActiveCueFollower
				active={{ id: "next", index: 19 }}
				layoutRevision={640}
				scrollToIndex={scrollToIndex}
				viewportRef={viewportRef}
			/>,
		);

		expect(scrollToIndex).toHaveBeenCalledTimes(1);
		expect(scrollIntoView).toHaveBeenCalledWith({
			block: "center",
			behavior: "smooth",
			inline: "nearest",
		});
	});
});
