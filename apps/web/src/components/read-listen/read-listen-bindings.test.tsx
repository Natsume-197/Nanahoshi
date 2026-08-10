import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type { ComponentProps } from "react";

let activeAudiobookUuid: string | null = "audio-1";
const loadAudiobook = mock(() => {});
const setExpanded = mock(() => {});
const seekTo = mock(() => {});
const scrollIntoView = mock(() => {});

function setReducedMotion(matches: boolean) {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: () => ({ matches }),
	});
}

mock.module("@/context/audio-player-context", () => ({
	toPlayerData: (details: unknown) => details,
	useAudioPlayerActions: () => ({
		loadAudiobook,
		seekTo,
		setExpanded,
	}),
	useAudioPlayerBook: () =>
		activeAudiobookUuid ? { uuid: activeAudiobookUuid } : null,
	useAudioPlayerState: () => ({
		audiobook: activeAudiobookUuid ? { uuid: activeAudiobookUuid } : null,
		globalCurrentTime: 0,
	}),
}));

const { ActiveReadListenCue, LoadReadListenAudiobook, SeekReadListenFromText } =
	await import("./read-listen-bindings");

type LoaderProps = ComponentProps<typeof LoadReadListenAudiobook>;

const details = {
	uuid: "audio-1",
	title: "Fixture audiobook",
} as ComponentProps<typeof LoadReadListenAudiobook>["details"];

beforeAll(() => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>");
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		HTMLImageElement: dom.window.HTMLImageElement,
		Node: dom.window.Node,
		requestAnimationFrame: mock(() => 1),
		cancelAnimationFrame: mock(() => {}),
	});
	Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", {
		configurable: true,
		value: scrollIntoView,
	});
});

afterEach(() => {
	cleanup();
	loadAudiobook.mockClear();
	setExpanded.mockClear();
	seekTo.mockClear();
	scrollIntoView.mockClear();
	setReducedMotion(false);
	activeAudiobookUuid = "audio-1";
});

describe("Read & Listen player bindings", () => {
	test("reloads the audiobook paused after the player is stopped", () => {
		const renderLoader = (props: LoaderProps) => (
			<LoadReadListenAudiobook {...props} />
		);
		const view = render(
			renderLoader({
				details,
				isAudiobookLoaded: true,
			}),
		);
		expect(loadAudiobook).not.toHaveBeenCalled();

		activeAudiobookUuid = null;
		view.rerender(
			renderLoader({
				details,
				isAudiobookLoaded: false,
			}),
		);

		expect(loadAudiobook).toHaveBeenCalledTimes(1);
		expect(loadAudiobook).toHaveBeenCalledWith(details, { autoplay: false });
	});

	test("collapses the player on reader exit", () => {
		const view = render(
			<LoadReadListenAudiobook details={details} isAudiobookLoaded={true} />,
		);

		view.unmount();

		expect(setExpanded).toHaveBeenCalledWith(false);
	});

	test("does not navigate to another section while Follow text is disabled", () => {
		const navigateToSection = mock(() => {});
		const cue = {
			id: "cue-1",
			text: {
				kind: "text-quote" as const,
				sectionRef: "chapter-2.xhtml",
				exact: "Second chapter.",
			},
			audioFileIndex: 0,
			startMs: 1_000,
			endMs: 2_000,
			globalStartMs: 1_000,
			globalEndMs: 2_000,
		};
		const readerApiRef = {
			current: { navigateToSection },
		} as unknown as ComponentProps<typeof ActiveReadListenCue>["readerApiRef"];

		render(
			<ActiveReadListenCue
				cue={cue}
				followText={false}
				sourceFormat="epub"
				readerApiRef={readerApiRef}
			/>,
		);

		expect(navigateToSection).not.toHaveBeenCalled();
	});

	test("smoothly follows an active cue into the reading focus area", () => {
		document.body.innerHTML =
			'<section id="ttu-epub-chapter-2-xhtml"><p>Second chapter.</p></section>';
		const cue = {
			id: "cue-2",
			text: {
				kind: "text-quote" as const,
				sectionRef: "chapter-2.xhtml",
				exact: "Second chapter.",
			},
			audioFileIndex: 0,
			startMs: 2_000,
			endMs: 3_000,
			globalStartMs: 2_000,
			globalEndMs: 3_000,
		};

		render(
			<ActiveReadListenCue
				cue={cue}
				followText={true}
				sourceFormat="epub"
				readerApiRef={{ current: null }}
			/>,
		);

		expect(scrollIntoView).toHaveBeenCalledWith({
			behavior: "smooth",
			block: "center",
			inline: "center",
		});
	});

	test("follows active cues without motion when reduced motion is enabled", () => {
		setReducedMotion(true);
		document.body.innerHTML =
			'<section id="ttu-epub-chapter-2-xhtml"><p>Second chapter.</p></section>';
		const cue = {
			id: "cue-2",
			text: {
				kind: "text-quote" as const,
				sectionRef: "chapter-2.xhtml",
				exact: "Second chapter.",
			},
			audioFileIndex: 0,
			startMs: 2_000,
			endMs: 3_000,
			globalStartMs: 2_000,
			globalEndMs: 3_000,
		};

		render(
			<ActiveReadListenCue
				cue={cue}
				followText={true}
				sourceFormat="epub"
				readerApiRef={{ current: null }}
			/>,
		);

		expect(scrollIntoView).toHaveBeenCalledWith({
			behavior: "auto",
			block: "center",
			inline: "center",
		});
	});

	test("seeks the audiobook from the reader position when enabling the mode", () => {
		document.body.innerHTML =
			'<section id="ttu-epub-chapter-xhtml"><p>一。</p><p>二。</p><p>三。</p></section>';
		const cue = {
			id: "cue-3",
			text: {
				kind: "text-quote" as const,
				sectionRef: "chapter.xhtml",
				exact: "三。",
			},
			audioFileIndex: 0,
			startMs: 9_000,
			endMs: 10_000,
			globalStartMs: 9_000,
			globalEndMs: 10_000,
		};

		render(
			<SeekReadListenFromText
				targetCharacter={2}
				sections={[
					{
						reference: "ttu-epub-chapter-xhtml",
						charactersWeight: 1,
						startCharacter: 0,
						characters: 3,
					},
				]}
				targetsBySection={
					new Map([
						["ttu-epub-chapter-xhtml", [{ anchor: cue.text, value: cue }]],
					])
				}
				onSettled={() => {}}
			/>,
		);

		expect(seekTo).toHaveBeenCalledWith(9);
	});
});
