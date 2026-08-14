import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import {
	rememberReadListenReaderEntry,
	rememberReadListenReaderPosition,
} from "@/lib/read-listen/reader-session";

let playerTime = 0;
const seekTo = mock((time: number) => {
	playerTime = time;
});
const scrollIntoView = mock(() => {});
let capturedReadListen:
	| {
			onExitReadListen: () => void;
			canSeekPreviousSentence: boolean;
			canSeekNextSentence: boolean;
			canRepeatSentence: boolean;
			onSeekPreviousSentence: () => void;
			onSeekNextSentence: () => void;
			sentenceRepeatMode: "off" | "once" | "loop";
			onCycleSentenceRepeatMode: () => void;
			followText: boolean;
			onToggleFollowText: () => void;
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
		isPlaying: true,
	}),
}));

mock.module("@/components/audio-player/player-host", () => ({
	PlayerHostReadListenBridge: ({
		context,
	}: {
		context: typeof capturedReadListen;
	}) => {
		capturedReadListen = context;
		return null;
	},
}));

const { ReadListenRuntime } = await import("./read-listen-runtime");

beforeAll(() => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://nanahoshi.test",
	});
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		Element: dom.window.Element,
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
	window.sessionStorage.clear();
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
				onExitReadListen={() => {}}
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
				onExitReadListen={() => {}}
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
				onExitReadListen={() => {}}
			/>,
		);
		expect(capturedReadListen?.canSeekPreviousSentence).toBe(true);
		expect(capturedReadListen?.canSeekNextSentence).toBe(false);
		capturedReadListen?.onSeekPreviousSentence();
		expect(seekTo).toHaveBeenLastCalledWith(0);
	});

	test("cycles sentence repetition from once to a continuous loop", () => {
		playerTime = 0.5;
		const runtime = () => (
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: document.body }}
				sections={[]}
				readerDomRevision="scroll-horizontal"
				onExitReadListen={() => {}}
			/>
		);
		const view = render(runtime());

		expect(capturedReadListen?.canRepeatSentence).toBe(true);
		expect(capturedReadListen?.sentenceRepeatMode).toBe("off");
		act(() => capturedReadListen?.onCycleSentenceRepeatMode());
		expect(seekTo).toHaveBeenLastCalledWith(0);
		expect(capturedReadListen?.sentenceRepeatMode).toBe("once");

		act(() => capturedReadListen?.onCycleSentenceRepeatMode());
		expect(capturedReadListen?.sentenceRepeatMode).toBe("loop");
		playerTime = 1.1;
		view.rerender(runtime());
		expect(seekTo).toHaveBeenCalledTimes(2);
		expect(seekTo).toHaveBeenLastCalledWith(0);

		act(() => capturedReadListen?.onCycleSentenceRepeatMode());
		expect(capturedReadListen?.sentenceRepeatMode).toBe("off");
	});

	test("pauses following on manual reading and returns to narration on request", () => {
		document.body.innerHTML =
			'<main id="reader-fixture"><div class="book-content"><section id="ttu-epub-chapter-xhtml"><p>一。</p></section></div></main>';
		const readerSurface = document.getElementById("reader-fixture");
		const paragraph = document.querySelector("p");
		Object.defineProperty(paragraph, "getBoundingClientRect", {
			configurable: true,
			value: () => ({
				top: 300,
				bottom: 340,
				left: 120,
				right: 360,
				width: 240,
				height: 40,
				x: 120,
				y: 300,
				toJSON: () => ({}),
			}),
		});

		const view = render(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: readerSurface }}
				sections={[]}
				readerDomRevision="scroll-horizontal"
				onExitReadListen={() => {}}
			/>,
		);

		expect(capturedReadListen?.followText).toBe(true);
		expect(scrollIntoView).not.toHaveBeenCalled();
		const bookContent = document.querySelector(".book-content");
		if (!bookContent) throw new Error("Missing reader content fixture");
		fireEvent.wheel(bookContent);
		expect(capturedReadListen?.followText).toBe(false);

		fireEvent.click(view.getByRole("button", { name: "Return to narration" }));
		expect(capturedReadListen?.followText).toBe(true);
		expect(scrollIntoView).toHaveBeenCalledTimes(1);
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
				onExitReadListen={() => {}}
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
				onExitReadListen={() => {}}
			/>,
		);

		expect(scrollIntoView).toHaveBeenCalledTimes(2);
	});

	test("opens at the latest aligned sentence when paused in a narration gap", () => {
		playerTime = 5;
		document.body.innerHTML =
			'<section id="ttu-epub-chapter-xhtml"><p>一。</p><p>三。</p></section>';

		render(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: document.body }}
				sections={[]}
				readerDomRevision="scroll-horizontal"
				onExitReadListen={() => {}}
			/>,
		);

		expect(scrollIntoView).toHaveBeenCalledTimes(1);
	});

	test("restores the exact synchronized text after a reload when playback has not moved", () => {
		playerTime = 9;
		rememberReadListenReaderEntry({
			pairUuid: "pair-1",
			ebookUuid: "ebook-1",
			audiobookUuid: "audio-1",
			originHref: "/dashboard/search?q=fixture",
			originHistoryIndex: 3,
			playheadSeconds: 9,
		});
		rememberReadListenReaderPosition({
			pairUuid: "pair-1",
			position: {
				exploredCharCount: 4,
				progress: 2 / 3,
				lastBookmarkModified: 1,
			},
			playheadSeconds: 9,
		});
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
				readerDomRevision="scroll-horizontal"
				onExitReadListen={() => {}}
			/>,
		);

		expect(seekTo).toHaveBeenLastCalledWith(9);
	});

	test("keeps playback alive when leaving the synchronized reader", () => {
		const onExitReadListen = mock(() => {});
		const view = render(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: document.body }}
				sections={[]}
				readerDomRevision="scroll-horizontal"
				onExitReadListen={onExitReadListen}
			/>,
		);

		capturedReadListen?.onExitReadListen();
		expect(onExitReadListen).toHaveBeenCalledTimes(1);

		view.unmount();
	});
});
