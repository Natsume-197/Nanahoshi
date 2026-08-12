import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { JSDOM } from "jsdom";

let playerTime = 0;
const seekTo = mock((time: number) => {
	playerTime = time;
});
const scrollIntoView = mock(() => {});
let capturedReadListen:
	| {
			canSeekPreviousSentence: boolean;
			canSeekNextSentence: boolean;
			canRepeatSentence: boolean;
			onSeekPreviousSentence: () => void;
			onSeekNextSentence: () => void;
			onRepeatSentence: () => void;
	  }
	| undefined;

const cues = [
	{
		id: "first",
		text: {
			kind: "text-quote" as const,
			sectionRef: "chapter.xhtml",
			exact: "一。",
		},
		audioFileIndex: 0,
		startMs: 0,
		endMs: 1_000,
	},
	{
		id: "entry",
		text: {
			kind: "text-quote" as const,
			sectionRef: "chapter.xhtml",
			exact: "三。",
		},
		audioFileIndex: 0,
		startMs: 9_000,
		endMs: 10_000,
	},
];

mock.module("@tanstack/react-query", () => ({
	useQuery: (options: { queryKey: string[] }) =>
		options.queryKey[0] === "read-listen-session"
			? {
					data: {
						pair: { audiobookUuid: "audio-1" },
						alignment: { createdAt: "revision-1", cues },
					},
					isLoading: false,
					isError: false,
				}
			: {
					data: {
						uuid: "audio-1",
						title: "Fixture audiobook",
						audioFiles: [{ index: 0, duration: 20 }],
					},
					isLoading: false,
					isError: false,
				},
}));

mock.module("@/utils/orpc", () => ({
	orpc: {
		readListen: {
			getSession: {
				queryOptions: () => ({ queryKey: ["read-listen-session"] }),
			},
		},
		audiobooks: {
			getDetails: {
				queryOptions: () => ({ queryKey: ["audiobook-details"] }),
			},
		},
	},
}));

mock.module("@/context/audio-player-context", () => ({
	toPlayerData: (details: unknown) => details,
	useAudioPlayerActions: () => ({
		loadAudiobook: () => {},
		seekTo,
		setExpanded: () => {},
	}),
	useAudioPlayerBook: () => ({ uuid: "audio-1" }),
	useAudioPlayerState: () => ({
		audiobook: { uuid: "audio-1" },
		globalCurrentTime: playerTime,
	}),
}));

mock.module("@/components/audio-player/mini-player", () => ({
	MiniPlayer: ({ readListen }: { readListen?: typeof capturedReadListen }) => {
		capturedReadListen = readListen;
		return null;
	},
}));

const { ReadListenRuntime } = await import("./read-listen-runtime");

beforeAll(() => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>");
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		HTMLImageElement: dom.window.HTMLImageElement,
		Node: dom.window.Node,
		requestAnimationFrame: (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		},
		cancelAnimationFrame: () => {},
	});
	Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", {
		configurable: true,
		value: scrollIntoView,
	});
});

afterEach(() => {
	cleanup();
	playerTime = 0;
	seekTo.mockClear();
	scrollIntoView.mockClear();
	capturedReadListen = undefined;
});

describe("ReadListenRuntime", () => {
	test("does not move the reader when the mode seeks audio from its entry bookmark", () => {
		document.body.innerHTML =
			'<section id="ttu-epub-chapter-xhtml"><p>一。</p><p>二。</p><p>三。</p></section>';

		render(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: document.body }}
				sections={[
					{
						reference: "ttu-epub-chapter-xhtml",
						charactersWeight: 1,
						startCharacter: 0,
						characters: 6,
					},
				]}
				initialTextPosition={4}
				readerDomRevision="scroll-horizontal"
			/>,
		);

		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	test("seeks to the previous and next aligned sentences", () => {
		const view = render(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: document.body }}
				sections={[]}
				readerDomRevision="scroll-horizontal"
			/>,
		);

		expect(capturedReadListen?.canSeekPreviousSentence).toBe(false);
		expect(capturedReadListen?.canSeekNextSentence).toBe(true);
		capturedReadListen?.onSeekNextSentence();
		expect(seekTo).toHaveBeenLastCalledWith(9);

		view.rerender(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: document.body }}
				sections={[]}
				readerDomRevision="pages-horizontal"
			/>,
		);
		expect(capturedReadListen?.canSeekPreviousSentence).toBe(true);
		expect(capturedReadListen?.canSeekNextSentence).toBe(false);
		capturedReadListen?.onSeekPreviousSentence();
		expect(seekTo).toHaveBeenLastCalledWith(0);
	});

	test("repeats the active aligned sentence from its beginning", () => {
		playerTime = 0.5;
		render(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: document.body }}
				sections={[]}
				readerDomRevision="scroll-horizontal"
			/>,
		);

		expect(capturedReadListen?.canRepeatSentence).toBe(true);
		capturedReadListen?.onRepeatSentence();
		expect(seekTo).toHaveBeenLastCalledWith(0);
	});

	test("rebinds the active cue after the reader replaces its document", () => {
		document.body.innerHTML =
			'<main id="reader-fixture"><section id="ttu-epub-chapter-xhtml"><p>一。</p></section></main>';
		const readerSurface = document.getElementById("reader-fixture");
		const view = render(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: readerSurface }}
				sections={[]}
				readerDomRevision="scroll-horizontal"
			/>,
		);
		expect(scrollIntoView).toHaveBeenCalledTimes(1);

		const replacement = document.createElement("section");
		replacement.id = "ttu-epub-chapter-xhtml";
		replacement.innerHTML = "<p>一。</p>";
		document.getElementById("ttu-epub-chapter-xhtml")?.replaceWith(replacement);
		view.rerender(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: readerSurface }}
				sections={[]}
				readerDomRevision="pages-horizontal"
			/>,
		);

		expect(scrollIntoView).toHaveBeenCalledTimes(2);
	});
});
