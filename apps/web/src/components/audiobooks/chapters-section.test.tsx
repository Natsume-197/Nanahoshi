import "@/test-utils/setup-dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { type ComponentProps, createContext, useContext } from "react";

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const Playback = createContext({ uuid: "this-book", globalCurrentTime: 0 });
const seekTo = mock(() => {});
const loadAudiobook = mock(() => {});
const actions = { seekTo, loadAudiobook };
mock.module("@/context/audio-player-context", () => ({
	useAudioPlayerBook: () => ({ uuid: useContext(Playback).uuid }),
	useAudioPlayerState: () => useContext(Playback),
	useAudioPlayerActions: () => actions,
	toPlayerData: (data: unknown) => data,
}));
const { ChaptersSection } = await import("./chapters-section");

afterEach(() => {
	cleanup();
	seekTo.mockClear();
	loadAudiobook.mockClear();
});

describe("audiobook chapter playback updates", () => {
	test("same chapter and unrelated playback do not render the list; boundaries and clicks still work", () => {
		let titleReads = 0;
		const chapters = Array.from({ length: 200 }, (_, index) => ({
			index,
			get title() {
				titleReads++;
				return `Chapter ${index + 1}`;
			},
			startTime: index * 60,
			endTime: (index + 1) * 60,
		}));
		const audiobook = { uuid: "this-book", chapters } as ComponentProps<
			typeof ChaptersSection
		>["audiobook"];
		const tree = (time: number, uuid = "this-book") => (
			<Playback value={{ uuid, globalCurrentTime: time }}>
				<ChaptersSection audiobook={audiobook} />
			</Playback>
		);
		const view = render(tree(1));
		expect(
			view
				.getByText("Chapter 1")
				.closest("button")
				?.getAttribute("aria-current"),
		).toBe("true");
		const initialReads = titleReads;
		for (const time of [2, 10, 30, 59]) view.rerender(tree(time));
		expect(titleReads).toBe(initialReads);
		view.rerender(tree(60));
		expect(titleReads).toBeGreaterThan(initialReads);
		expect(
			view
				.getByText("Chapter 2")
				.closest("button")
				?.getAttribute("aria-current"),
		).toBe("true");
		fireEvent.click(view.getByText("Chapter 3"));
		expect(seekTo).toHaveBeenCalledWith(120);
		view.rerender(tree(61, "another-book"));
		expect(view.container.querySelector('[aria-current="true"]')).toBeNull();
		const unrelatedReads = titleReads;
		view.rerender(tree(120, "another-book"));
		view.rerender(tree(121, "another-book"));
		expect(titleReads).toBe(unrelatedReads);
		fireEvent.click(view.getByText("Chapter 3"));
		expect(loadAudiobook).toHaveBeenCalledWith(audiobook, { startTime: 120 });
	});
});
