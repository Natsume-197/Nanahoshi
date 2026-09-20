import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type { ComponentProps } from "react";
import type { BookReaderApi } from "@/features/reader/reader-contract";

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
	test("highlights the active occurrence when identical sentences repeat", () => {
		document.body.innerHTML =
			'<section id="nanahoshi-epub-chapter-xhtml"><p>はい。はい。</p></section>';
		let activeRanges: Range[] = [];
		let activeHighlight: { ranges: Range[] } | undefined;
		Object.defineProperty(window, "CSS", {
			configurable: true,
			value: {
				highlights: {
					set: (name: string, highlight: { ranges: Range[] }) => {
						if (name === "read-listen-active") {
							activeHighlight = highlight;
							activeRanges = highlight.ranges;
						}
					},
					get: (name: string) =>
						name === "read-listen-active" ? activeHighlight : undefined,
					delete: (name: string) => {
						if (name === "read-listen-active") activeHighlight = undefined;
						return true;
					},
				},
			},
		});
		Object.defineProperty(window, "Highlight", {
			configurable: true,
			value: class Highlight {
				ranges: Range[];

				constructor(...ranges: Range[]) {
					this.ranges = ranges;
				}
			},
		});
		const firstCue = {
			id: "hai-first",
			text: {
				kind: "text-quote" as const,
				sectionRef: "chapter.xhtml",
				exact: "はい",
			},
			audioFileIndex: 0,
			startMs: 0,
			endMs: 1_000,
			globalStartMs: 0,
			globalEndMs: 1_000,
		};
		const secondCue = {
			...firstCue,
			id: "hai-second",
			startMs: 1_000,
			endMs: 2_000,
			globalStartMs: 1_000,
			globalEndMs: 2_000,
		};
		render(
			<ActiveReadListenCue
				cue={secondCue}
				sectionTargets={[
					{ anchor: firstCue.text, value: firstCue },
					{ anchor: secondCue.text, value: secondCue },
				]}
				followText={false}
				sourceFormat="epub"
				readerApiRef={{ current: null }}
			/>,
		);

		expect(activeRanges[0]?.startOffset).toBe(3);
	});

	test("passes a repeated cue occurrence to virtualized reader modes", () => {
		document.body.innerHTML =
			'<main class="book-content book-content--paginated"><section id="nanahoshi-epub-chapter-xhtml"><p>はい。はい。</p></section></main>';
		const navigateToTextAnchor = mock(() => {});
		const pendingFrames: FrameRequestCallback[] = [];
		const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
		globalThis.requestAnimationFrame = (callback) => {
			pendingFrames.push(callback);
			return pendingFrames.length;
		};
		const firstCue = {
			id: "first-repeat",
			text: {
				kind: "text-quote" as const,
				sectionRef: "chapter.xhtml",
				exact: "はい。",
			},
			audioFileIndex: 0,
			startMs: 0,
			endMs: 1_000,
			globalStartMs: 0,
			globalEndMs: 1_000,
		};
		const secondCue = {
			...firstCue,
			id: "second-repeat",
			startMs: 1_000,
			endMs: 2_000,
			globalStartMs: 1_000,
			globalEndMs: 2_000,
		};
		try {
			render(
				<ActiveReadListenCue
					cue={secondCue}
					sectionTargets={[
						{ anchor: firstCue.text, value: firstCue },
						{ anchor: secondCue.text, value: secondCue },
					]}
					followText
					sourceFormat="epub"
					readerApiRef={{
						current: { navigateToTextAnchor } as unknown as BookReaderApi,
					}}
				/>,
			);

			expect(navigateToTextAnchor).toHaveBeenCalledWith(
				expect.objectContaining({ occurrence: 1 }),
			);
			pendingFrames.shift()?.(0);
			// Paginated/focus readers own their navigation geometry. A second generic
			// scrollIntoView would center a tategaki sentence between page boundaries.
			expect(scrollIntoView).not.toHaveBeenCalled();
		} finally {
			globalThis.requestAnimationFrame = previousRequestAnimationFrame;
		}
	});

	test("enters the narrated page when the paginated reader API mounts late", () => {
		document.body.innerHTML = "";
		const navigateToTextAnchor = mock(() => {});
		const pendingFrames: FrameRequestCallback[] = [];
		const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
		globalThis.requestAnimationFrame = (callback) => {
			pendingFrames.push(callback);
			return pendingFrames.length;
		};
		const cue = {
			id: "dashboard-entry",
			text: {
				kind: "text-quote" as const,
				sectionRef: "chapter-8.xhtml",
				exact: "The currently narrated sentence.",
			},
			audioFileIndex: 0,
			startMs: 90_000,
			endMs: 91_000,
			globalStartMs: 90_000,
			globalEndMs: 91_000,
		};
		const readerApiRef = {
			current: null,
		} as ComponentProps<typeof ActiveReadListenCue>["readerApiRef"];

		try {
			render(
				<ActiveReadListenCue
					cue={cue}
					sectionTargets={[{ anchor: cue.text, value: cue }]}
					followText
					sourceFormat="epub"
					readerApiRef={readerApiRef}
				/>,
			);
			readerApiRef.current = {
				navigateToTextAnchor,
			} as unknown as BookReaderApi;
			pendingFrames.shift()?.(0);
			pendingFrames.shift()?.(1);

			expect(navigateToTextAnchor).toHaveBeenCalledWith(
				expect.objectContaining({
					sectionReference: "nanahoshi-epub-chapter-8-xhtml",
				}),
			);
			expect(navigateToTextAnchor).toHaveBeenCalledTimes(1);
		} finally {
			globalThis.requestAnimationFrame = previousRequestAnimationFrame;
		}
	});

	test("retries entry navigation when paginated startup discards the first jump", () => {
		document.body.innerHTML =
			'<main class="book-content book-content--paginated"><section id="previous-section">Stored reader page.</section></main>';
		const pendingFrames: FrameRequestCallback[] = [];
		const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
		globalThis.requestAnimationFrame = (callback) => {
			pendingFrames.push(callback);
			return pendingFrames.length;
		};
		const cue = {
			id: "discarded-dashboard-entry",
			text: {
				kind: "text-quote" as const,
				sectionRef: "chapter-8.xhtml",
				exact: "The currently narrated sentence.",
			},
			audioFileIndex: 0,
			startMs: 90_000,
			endMs: 91_000,
			globalStartMs: 90_000,
			globalEndMs: 91_000,
		};
		const navigateToTextAnchor = mock(() => {
			if (navigateToTextAnchor.mock.calls.length !== 2) return;
			document.querySelector("main")?.replaceChildren();
			document
				.querySelector("main")
				?.insertAdjacentHTML(
					"beforeend",
					'<section id="nanahoshi-epub-chapter-8-xhtml">The currently narrated sentence.</section>',
				);
		});

		try {
			render(
				<ActiveReadListenCue
					cue={cue}
					sectionTargets={[{ anchor: cue.text, value: cue }]}
					followText
					sourceFormat="epub"
					readerApiRef={{
						current: { navigateToTextAnchor } as unknown as BookReaderApi,
					}}
				/>,
			);
			for (let frame = 0; frame < 12; frame += 1) {
				pendingFrames.shift()?.(frame);
			}

			expect(navigateToTextAnchor).toHaveBeenCalledTimes(2);
			expect(
				document.getElementById("nanahoshi-epub-chapter-8-xhtml")?.textContent,
			).toBe(cue.text.exact);
		} finally {
			globalThis.requestAnimationFrame = previousRequestAnimationFrame;
		}
	});

	test("does not undo a sentence page turn by centering its multi-page paragraph", () => {
		document.body.innerHTML =
			'<main class="book-content book-content--paginated"><div class="book-content-container" style="column-count: 2"><section id="nanahoshi-epub-chapter-xhtml"><p>次の文です。</p></section></div></main>';
		const navigateToTextAnchor = mock(() => {});
		const snapToPage = mock(() => {});
		const pendingFrames: FrameRequestCallback[] = [];
		const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
		globalThis.requestAnimationFrame = (callback) => {
			pendingFrames.push(callback);
			return pendingFrames.length;
		};
		const cue = {
			id: "next-spread",
			text: {
				kind: "text-quote" as const,
				sectionRef: "chapter.xhtml",
				exact: "次の文",
			},
			audioFileIndex: 0,
			startMs: 0,
			endMs: 1_000,
			globalStartMs: 0,
			globalEndMs: 1_000,
		};
		try {
			render(
				<ActiveReadListenCue
					cue={cue}
					sectionTargets={[{ anchor: cue.text, value: cue }]}
					followText
					forceFollow
					sourceFormat="epub"
					readerApiRef={{
						current: {
							navigateToTextAnchor,
							snapToPage,
						} as unknown as BookReaderApi,
					}}
				/>,
			);

			pendingFrames.shift()?.(0);
			expect(navigateToTextAnchor).toHaveBeenCalledTimes(1);
			expect(scrollIntoView).not.toHaveBeenCalled();
			expect(snapToPage).not.toHaveBeenCalled();
		} finally {
			globalThis.requestAnimationFrame = previousRequestAnimationFrame;
		}
	});

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
				sectionTargets={[{ anchor: cue.text, value: cue }]}
				followText={false}
				sourceFormat="epub"
				readerApiRef={readerApiRef}
			/>,
		);

		expect(navigateToSection).not.toHaveBeenCalled();
	});

	test("smoothly follows an active cue into the reading focus area", () => {
		document.body.innerHTML =
			'<section id="nanahoshi-epub-chapter-2-xhtml"><p>Second chapter.</p></section>';
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
				sectionTargets={[{ anchor: cue.text, value: cue }]}
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

	test("keeps trying a forced return until the narrated sentence finishes rendering", () => {
		document.body.innerHTML =
			'<section id="nanahoshi-epub-chapter-2-xhtml"></section>';
		const cue = {
			id: "cue-late-render",
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
		const pendingFrames: FrameRequestCallback[] = [];
		const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
		globalThis.requestAnimationFrame = (callback) => {
			pendingFrames.push(callback);
			return pendingFrames.length;
		};

		try {
			render(
				<ActiveReadListenCue
					cue={cue}
					sectionTargets={[{ anchor: cue.text, value: cue }]}
					followText
					forceFollow
					sourceFormat="epub"
					readerApiRef={{ current: null }}
				/>,
			);
			expect(pendingFrames).toHaveLength(1);
			const section = document.getElementById("nanahoshi-epub-chapter-2-xhtml");
			if (!section) throw new Error("Missing late-render section fixture");
			section.innerHTML = "<p>Second chapter.</p>";
			pendingFrames.shift()?.(0);

			expect(scrollIntoView).toHaveBeenCalledTimes(1);
		} finally {
			globalThis.requestAnimationFrame = previousRequestAnimationFrame;
		}
	});

	test("does not move a cue that is already inside the reading comfort zone", () => {
		document.body.innerHTML =
			'<section id="nanahoshi-epub-chapter-2-xhtml"><p>Second chapter.</p></section>';
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
		const cue = {
			id: "cue-comfortable",
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
				sectionTargets={[{ anchor: cue.text, value: cue }]}
				followText
				sourceFormat="epub"
				readerApiRef={{ current: null }}
			/>,
		);

		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	test("does not recenter a visible sentence within a paginated spread", () => {
		document.body.innerHTML =
			'<main class="book-content book-content--paginated"><section id="nanahoshi-epub-chapter-2-xhtml"><p>Second chapter.</p></section></main>';
		const paragraph = document.querySelector("p");
		Object.defineProperty(paragraph, "getBoundingClientRect", {
			configurable: true,
			value: () => ({
				top: 280,
				bottom: 330,
				left: 780,
				right: 920,
				width: 140,
				height: 50,
				x: 780,
				y: 280,
				toJSON: () => ({}),
			}),
		});
		const cue = {
			id: "cue-paginated",
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
				sectionTargets={[{ anchor: cue.text, value: cue }]}
				followText
				sourceFormat="epub"
				readerApiRef={{ current: null }}
			/>,
		);

		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	test("follows active cues without motion when reduced motion is enabled", () => {
		setReducedMotion(true);
		document.body.innerHTML =
			'<section id="nanahoshi-epub-chapter-2-xhtml"><p>Second chapter.</p></section>';
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
				sectionTargets={[{ anchor: cue.text, value: cue }]}
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
			'<section id="nanahoshi-epub-chapter-xhtml"><p>一。</p><p>二。</p><p>三。</p></section>';
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
						reference: "nanahoshi-epub-chapter-xhtml",
						charactersWeight: 1,
						startCharacter: 0,
						characters: 3,
					},
				]}
				targetsBySection={
					new Map([
						[
							"nanahoshi-epub-chapter-xhtml",
							[{ anchor: cue.text, value: cue }],
						],
					])
				}
				readerApiRef={{ current: null }}
				sourceFormat="epub"
				onSettled={() => {}}
			/>,
		);

		expect(seekTo).toHaveBeenCalledWith(9);
	});
});

describe("active highlight document lifecycle", () => {
	for (const followText of [true, false]) {
		for (const scenario of [
			"late section",
			"replaced text",
			"replaced section",
		] as const) {
			test(`recovers the current sentence after ${scenario} (follow=${followText})`, async () => {
				document.body.innerHTML = '<main id="surface"></main>';
				const surface = document.getElementById("surface");
				if (!surface) throw new Error("Missing fixture surface");
				const markup =
					'<section id="nanahoshi-epub-chapter-xhtml"><p>現在の文。</p></section>';
				if (scenario !== "late section") surface.innerHTML = markup;
				const highlights = new Map<string, Set<Range>>();
				Object.defineProperty(window, "CSS", {
					configurable: true,
					value: { highlights },
				});
				Object.defineProperty(window, "Highlight", {
					configurable: true,
					value: class extends Set<Range> {
						constructor(...ranges: Range[]) {
							super(ranges);
						}
					},
				});
				const frames = new Map<number, FrameRequestCallback>();
				let frameId = 0;
				const originalRequest = globalThis.requestAnimationFrame;
				const originalCancel = globalThis.cancelAnimationFrame;
				globalThis.requestAnimationFrame = (callback) => {
					frames.set(++frameId, callback);
					return frameId;
				};
				globalThis.cancelAnimationFrame = (id) => {
					frames.delete(id);
				};
				const flushFrame = async () => {
					await act(async () => {
						const pending = [...frames.values()];
						frames.clear();
						for (const callback of pending) callback(0);
						await Promise.resolve();
					});
				};
				const cue = {
					id: "current",
					text: {
						kind: "text-quote" as const,
						sectionRef: "chapter.xhtml",
						exact: "現在の文。",
					},
					audioFileIndex: 0,
					startMs: 0,
					endMs: 10000,
					globalStartMs: 0,
					globalEndMs: 10000,
				};
				const navigateToTextAnchor = mock(() => {});
				try {
					render(
						<ActiveReadListenCue
							cue={cue}
							sectionTargets={[{ anchor: cue.text, value: cue }]}
							followText={followText}
							sourceFormat="epub"
							readerApiRef={{
								current: { navigateToTextAnchor } as unknown as BookReaderApi,
							}}
						/>,
					);
					for (let frame = 0; frame < 40; frame++) await flushFrame();
					await act(async () => {
						if (scenario !== "replaced text") surface.innerHTML = markup;
						else {
							const paragraph = surface.querySelector("p");
							if (!paragraph) throw new Error("Missing fixture paragraph");
							paragraph.textContent = "現在の文。";
						}
						await Promise.resolve();
					});
					await flushFrame();
					await flushFrame();
					const ranges = [...(highlights.get("read-listen-active") ?? [])];
					expect(ranges.map((range) => range.toString()).join("")).toBe(
						cue.text.exact,
					);
					expect(
						ranges.every((range) => range.startContainer.isConnected),
					).toBe(true);
					if (followText) {
						expect(navigateToTextAnchor).toHaveBeenCalled();
					} else {
						expect(navigateToTextAnchor).not.toHaveBeenCalled();
					}
					cleanup();
					surface.innerHTML = markup;
					await flushFrame();
					await flushFrame();
					expect(highlights.has("read-listen-active")).toBe(false);
					expect(frames.size).toBe(0);
				} finally {
					cleanup();
					globalThis.requestAnimationFrame = originalRequest;
					globalThis.cancelAnimationFrame = originalCancel;
				}
			});
		}
	}
});
