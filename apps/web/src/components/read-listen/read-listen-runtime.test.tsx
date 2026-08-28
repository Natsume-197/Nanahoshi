import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type { BookReaderApi } from "@/features/reader/reader-contract";
import { FOCUS_SENTENCE_NAVIGATION_EVENT } from "@/features/reader/renderers/focus/focus-navigation";
import {
	rememberReadListenReaderEntry,
	rememberReadListenReaderPosition,
} from "@/lib/read-listen/reader-session";

let playerTime = 0;
let playerPlaying = true;
const seekTo = mock((time: number) => {
	playerTime = time;
});
const pause = mock(() => {
	playerPlaying = false;
});
const play = mock(() => {
	playerPlaying = true;
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
	{
		id: "after-entry",
		text: {
			kind: "text-quote" as const,
			sectionRef: "chapter.xhtml",
			exact: "四。",
		},
		audioFileIndex: 0,
		startMs: 10_000,
		endMs: 11_000,
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
		getGlobalCurrentTime: () => playerTime,
		pause,
		play,
		setExpanded: () => {},
	}),
	useAudioPlayerBook: () => ({ uuid: "audio-1" }),
	useAudioPlayerState: () => ({
		audiobook: { uuid: "audio-1" },
		globalCurrentTime: playerTime,
		isPlaying: playerPlaying,
		speed: 1,
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

const { ReadListenRuntime, readListenLineEndDelay, readListenLineStartTime } =
	await import("./read-listen-runtime");

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
	playerPlaying = true;
	seekTo.mockClear();
	pause.mockClear();
	play.mockClear();
	scrollIntoView.mockClear();
	capturedReadListen = undefined;
	window.sessionStorage.clear();
});

describe("ReadListenRuntime", () => {
	test("accounts for playback speed when scheduling a line-end pause", () => {
		expect(
			readListenLineEndDelay({
				globalEndMs: 2_000,
				globalCurrentTime: 1,
				playbackRate: 2,
			}),
		).toBe(500);
	});

	test("adds preroll when a focus line requires a seek", () => {
		expect(readListenLineStartTime(9_000)).toBe(8.8);
		expect(readListenLineStartTime(100)).toBe(0);
	});

	test("pauses at the line end and resumes from the next focus line", async () => {
		document.body.innerHTML =
			'<main id="reader-fixture"><section id="nanahoshi-epub-chapter-xhtml"><p>一。</p><p>二。</p><p>三。</p></section></main>';
		playerTime = 0.999;
		const props = {
			pairUuid: "pair-1",
			ebookUuid: "ebook-1",
			sourceFormat: "epub" as const,
			readerApiRef: { current: null },
			readerSurfaceRef: {
				current: document.getElementById("reader-fixture"),
			},
			sections: [
				{
					reference: "nanahoshi-epub-chapter-xhtml",
					charactersWeight: 1,
					startCharacter: 0,
					characters: 6,
				},
			],
			readerDomRevision: "focus",
			pauseAudioAfterLine: true,
			onExitReadListen: () => {},
		};
		render(<ReadListenRuntime {...props} />);

		await act(() => new Promise((resolve) => window.setTimeout(resolve, 5)));
		expect(pause).toHaveBeenCalledTimes(1);

		act(() => {
			props.readerSurfaceRef.current?.dispatchEvent(
				new window.CustomEvent(FOCUS_SENTENCE_NAVIGATION_EVENT, {
					bubbles: true,
					detail: { character: 4, direction: 1 },
				}),
			);
		});

		expect(seekTo).not.toHaveBeenCalled();
		expect(play).toHaveBeenCalledTimes(1);
	});

	test("starts the next focus line even when the current line is still playing", () => {
		document.body.innerHTML =
			'<main id="reader-fixture"><section id="nanahoshi-epub-chapter-xhtml"><p>一。</p><p>二。</p><p>三。</p></section></main>';
		playerTime = 0.5;
		const surface = document.getElementById("reader-fixture");
		render(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: surface }}
				sections={[
					{
						reference: "nanahoshi-epub-chapter-xhtml",
						charactersWeight: 1,
						startCharacter: 0,
						characters: 6,
					},
				]}
				readerDomRevision="focus"
				pauseAudioAfterLine
				onExitReadListen={() => {}}
			/>,
		);

		act(() => {
			surface?.dispatchEvent(
				new window.CustomEvent(FOCUS_SENTENCE_NAVIGATION_EVENT, {
					bubbles: true,
					detail: { character: 4, direction: 1 },
				}),
			);
		});

		expect(seekTo).toHaveBeenCalledWith(8.8);
		expect(play).toHaveBeenCalledTimes(1);
	});

	test("cancels the previous cue pause when focus navigation targets a new line", async () => {
		document.body.innerHTML =
			'<main id="reader-fixture"><section id="nanahoshi-epub-chapter-xhtml"><p>一。</p><p>二。</p><p>三。</p><p>四。</p></section></main>';
		playerTime = 0.999;
		const surface = document.getElementById("reader-fixture");
		render(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: surface }}
				sections={[
					{
						reference: "nanahoshi-epub-chapter-xhtml",
						charactersWeight: 1,
						startCharacter: 0,
						characters: 8,
					},
				]}
				readerDomRevision="focus"
				pauseAudioAfterLine
				onExitReadListen={() => {}}
			/>,
		);

		act(() => {
			surface?.dispatchEvent(
				new window.CustomEvent(FOCUS_SENTENCE_NAVIGATION_EVENT, {
					bubbles: true,
					detail: { character: 4, direction: 1 },
				}),
			);
		});

		await act(() => new Promise((resolve) => window.setTimeout(resolve, 5)));
		expect(seekTo).toHaveBeenCalledWith(9.8);
		expect(play).toHaveBeenCalledTimes(1);
		expect(pause).not.toHaveBeenCalled();
	});

	test("keeps the focus line target when the active cue crosses its boundary", async () => {
		document.body.innerHTML =
			'<main id="reader-fixture"><section id="nanahoshi-epub-chapter-xhtml"><p>一。</p><p>二。</p><p>三。</p><p>四。</p></section></main>';
		playerTime = 9.95;
		const surface = document.getElementById("reader-fixture");
		const props = {
			pairUuid: "pair-1",
			ebookUuid: "ebook-1",
			sourceFormat: "epub" as const,
			readerApiRef: { current: null },
			readerSurfaceRef: { current: surface },
			sections: [
				{
					reference: "nanahoshi-epub-chapter-xhtml",
					charactersWeight: 1,
					startCharacter: 0,
					characters: 8,
				},
			],
			readerDomRevision: "focus",
			pauseAudioAfterLine: true,
			onExitReadListen: () => {},
		};
		const view = render(<ReadListenRuntime {...props} />);

		await act(() => new Promise((resolve) => window.setTimeout(resolve, 10)));
		playerTime = 10.01;
		view.rerender(<ReadListenRuntime {...props} />);
		await act(() => new Promise((resolve) => window.setTimeout(resolve, 60)));

		expect(pause).toHaveBeenCalledTimes(1);
	});

	test("does not move the reader when the mode seeks audio from its entry position", () => {
		document.body.innerHTML =
			'<section id="nanahoshi-epub-chapter-xhtml"><p>一。</p><p>二。</p><p>三。</p></section>';

		render(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: document.body }}
				sections={[
					{
						reference: "nanahoshi-epub-chapter-xhtml",
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

	test("pauses following on manual reading and returns to narration on request", () => {
		document.body.innerHTML =
			'<main id="reader-fixture"><div class="book-content"><section id="nanahoshi-epub-chapter-xhtml"><p>一。</p></section></div></main>';
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

		render(
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

		act(() => capturedReadListen?.onToggleFollowText());
		expect(capturedReadListen?.followText).toBe(true);
		expect(scrollIntoView).toHaveBeenCalledTimes(1);
	});

	test("rebinds the active cue after the reader replaces its document", () => {
		document.body.innerHTML =
			'<main id="reader-fixture"><section id="nanahoshi-epub-chapter-xhtml"><p>一。</p></section></main>';
		const readerSurface = document.getElementById("reader-fixture");
		const continuousNavigateToTextAnchor = mock(() => {});
		const paginatedNavigateToTextAnchor = mock(() => {});
		const readerApiRef = {
			current: {
				navigateToTextAnchor: continuousNavigateToTextAnchor,
			} as unknown as BookReaderApi,
		};
		const view = render(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={readerApiRef}
				readerSurfaceRef={{ current: readerSurface }}
				sections={[]}
				readerDomRevision="scroll-horizontal"
				onExitReadListen={() => {}}
			/>,
		);
		expect(scrollIntoView).not.toHaveBeenCalled();
		expect(continuousNavigateToTextAnchor).toHaveBeenCalledTimes(1);

		const replacement = document.createElement("section");
		replacement.id = "nanahoshi-epub-chapter-xhtml";
		replacement.innerHTML = "<p>一。</p>";
		document
			.getElementById("nanahoshi-epub-chapter-xhtml")
			?.replaceWith(replacement);
		readerApiRef.current = {
			navigateToTextAnchor: paginatedNavigateToTextAnchor,
		} as unknown as BookReaderApi;
		view.rerender(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={readerApiRef}
				readerSurfaceRef={{ current: readerSurface }}
				sections={[]}
				readerDomRevision="pages-horizontal"
				onExitReadListen={() => {}}
			/>,
		);

		// Each renderer API owns its coordinate system; rebinding must not add a
		// generic centered scroll on top of either semantic navigation.
		expect(scrollIntoView).not.toHaveBeenCalled();
		expect(paginatedNavigateToTextAnchor).toHaveBeenCalledTimes(1);
	});

	test("opens at the latest aligned sentence when paused in a narration gap", () => {
		playerTime = 5;
		document.body.innerHTML =
			'<section id="nanahoshi-epub-chapter-xhtml"><p>一。</p><p>三。</p></section>';

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
				modifiedAt: 1,
			},
			playheadSeconds: 9,
		});
		document.body.innerHTML =
			'<section id="nanahoshi-epub-chapter-xhtml"><p>一。</p><p>二。</p><p>三。</p></section>';

		render(
			<ReadListenRuntime
				pairUuid="pair-1"
				ebookUuid="ebook-1"
				sourceFormat="epub"
				readerApiRef={{ current: null }}
				readerSurfaceRef={{ current: document.body }}
				sections={[
					{
						reference: "nanahoshi-epub-chapter-xhtml",
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
