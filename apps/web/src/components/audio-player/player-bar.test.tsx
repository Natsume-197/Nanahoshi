import "@nanahoshi/test-utils/setup-dom";

import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { m } from "@/paraglide/messages";
import { addBookmark, listBookmarks } from "./bookmarks";

const seekTo = mock(() => {});
const setExpanded = mock(() => {});
const togglePlay = mock(() => {});
const state = {
	audiobook: {
		uuid: "compact-book",
		title: "Test book",
		filename: "test.m4b",
		cover: null,
		authors: [],
		chapters: [],
	},
	globalCurrentTime: 123,
	totalDuration: 600,
	activeChapterIndex: -1,
	showError: false,
};

mock.module("@/context/audio-player-context", () => ({
	useAudioPlayerState: () => state,
	useAudioPlayerActions: () => ({ seekTo, setExpanded, togglePlay }),
}));
mock.module("@/components/audio-player/marquee-text", () => ({
	MarqueeText: ({ text }: { text: string }) => <span>{text}</span>,
}));
mock.module("@/components/audio-player/player-transport", () => ({
	PlayerTransport: () => null,
	JumpBackButton: () => null,
	PlayPauseButton: () => null,
}));
mock.module("@/components/audio-player/player-seek-bar", () => ({
	PlayerSeekBar: () => null,
}));
mock.module("@/components/audio-player/player-settings", () => ({
	PlayerSettings: () => null,
}));
mock.module("@/components/audio-player/player-volume-control", () => ({
	PlayerVolumeControl: () => null,
}));
mock.module("@/components/audio-player/read-listen-player", () => ({
	ReadListenFollowButton: () => null,
	ReadListenOpenButton: () => null,
	ReadListenSentenceSeekButton: () => null,
}));

const { cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
const { TooltipProvider } = await import("@nanahoshi/ui/components/tooltip");
const { PlayerBar } = await import("./player-bar");

beforeEach(() => {
	window.localStorage.clear();
	seekTo.mockClear();
	setExpanded.mockClear();
	togglePlay.mockClear();
});
afterEach(cleanup);

test("the mobile strip keeps bookmarks out, leaving them to the dock and expanded player", () => {
	const view = render(
		<TooltipProvider>
			<PlayerBar />
		</TooltipProvider>,
	);
	// Only the desktop dock renders a trigger now.
	expect(
		view.getAllByRole("button", { name: m["audiobook.player_bookmarks"]() }),
	).toHaveLength(1);
});

test("desktop creates and selects bookmarks without expanding or pausing", async () => {
	addBookmark(state.audiobook.uuid, 45, "Saved passage");
	const view = render(
		<TooltipProvider>
			<PlayerBar />
		</TooltipProvider>,
	);
	const trigger = view.getAllByRole("button", {
		name: m["audiobook.player_bookmarks"](),
	})[0];
	if (!trigger) throw new Error("Missing bookmark trigger");
	fireEvent.pointerDown(trigger);
	fireEvent.click(trigger);
	await waitFor(() =>
		expect(view.getByRole("button", { name: /Saved passage/ })).toBeDefined(),
	);
	// Rows are enumerated in time order (accessible name concatenates
	// the spans: "1" + "0:45" + label).
	expect(view.getByRole("button", { name: /^1/ })).toBeDefined();
	fireEvent.click(view.getByRole("button", { name: /Saved passage/ }));
	expect(seekTo).toHaveBeenCalledWith(45);
	// One tap saves the moment; the note is added on the row afterwards.
	fireEvent.click(
		view.getByRole("button", {
			name: new RegExp(`^${m["audiobook.player_bookmark_add"]()}`),
		}),
	);
	const editButtons = view.getAllByRole("button", {
		name: m["audiobook.player_bookmark_edit"](),
	});
	const newRowEdit = editButtons[1];
	if (!newRowEdit) throw new Error("Missing edit button for the new row");
	fireEvent.click(newRowEdit);
	fireEvent.change(view.getByRole("textbox"), {
		target: { value: "New passage" },
	});
	fireEvent.click(
		view.getByRole("button", {
			name: m["audiobook.player_bookmark_label_save"](),
		}),
	);
	expect(
		listBookmarks(state.audiobook.uuid).map(({ time, label }) => ({
			time,
			label,
		})),
	).toEqual([
		{ time: 45, label: "Saved passage" },
		{ time: 123, label: "New passage" },
	]);
	expect(setExpanded).not.toHaveBeenCalled();
	expect(togglePlay).not.toHaveBeenCalled();
});
