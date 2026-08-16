import { describe, expect, mock, test } from "bun:test";
import type { ReaderPosition } from "@/features/reader/document/types";
import {
	disableReadListenReader,
	loadReadListenReaderSession,
	navigateReadListenReaderMode,
	navigateToReadListenReader,
	planReadListenReaderExit,
	type ReadListenReaderSessionStorage,
	rememberReadListenReaderEntry,
	rememberReadListenReaderPosition,
	resolveReadListenReaderPosition,
} from "./reader-session";

function memoryStorage(): ReadListenReaderSessionStorage {
	const values = new Map<string, string>();
	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
	};
}

describe("Read & Listen reader session", () => {
	test("opens the synchronized reader without replacing playback state", async () => {
		const navigate = mock(async () => {});

		await navigateToReadListenReader({
			navigate,
			ebookUuid: "ebook-1",
			pairUuid: "pair-1",
		});

		expect(navigate).toHaveBeenCalledWith({
			to: "/reader/$uuid",
			params: { uuid: "ebook-1" },
			search: { pair: "pair-1" },
		});
	});

	test("remembers the live reader bookmark before leaving the mode", async () => {
		const position: ReaderPosition = {
			exploredCharCount: 420,
			progress: 0.42,
			scrollY: 1_200,
			modifiedAt: 1,
		};
		const steps: string[] = [];
		let finishLeaving = () => {};
		const rememberPosition = mock((remembered: ReaderPosition) => {
			steps.push(`remember:${remembered.exploredCharCount}`);
		});
		const leaving = new Promise<void>((resolve) => {
			finishLeaving = resolve;
		});

		const result = disableReadListenReader({
			getCurrentPosition: () => {
				steps.push("capture");
				return position;
			},
			rememberPosition,
			leaveMode: () => {
				steps.push("leave");
				return leaving;
			},
		});
		finishLeaving();
		await result;

		expect(steps).toEqual(["capture", "remember:420", "leave"]);
		expect(rememberPosition).toHaveBeenCalledWith(position);
	});

	test("reopens at the bookmark remembered when the mode was closed", async () => {
		const livePosition: ReaderPosition = {
			exploredCharCount: 420,
			progress: 0.42,
			scrollY: 1_200,
			modifiedAt: 1,
		};
		let rememberedPosition: ReaderPosition | undefined;
		await disableReadListenReader({
			getCurrentPosition: () => livePosition,
			rememberPosition: (position) => {
				rememberedPosition = position;
			},
			leaveMode: async () => {},
		});

		expect(
			resolveReadListenReaderPosition({
				livePosition: undefined,
				exploredCharCount: -1,
				rememberedPosition,
				bookCharCount: 1_000,
			}),
		).toEqual(livePosition);
	});

	test("does not let route navigation reset the reader scroll when closing the mode", async () => {
		const navigate = mock(async () => {});

		await navigateReadListenReaderMode({
			navigate,
			uuid: "ebook-1",
		});

		expect(navigate).toHaveBeenCalledWith({
			to: "/reader/$uuid",
			params: { uuid: "ebook-1" },
			search: {},
			replace: true,
			resetScroll: false,
		});
	});

	test("remembers the exact origin and reader position for this pairing", () => {
		const storage = memoryStorage();
		rememberReadListenReaderEntry({
			storage,
			pairUuid: "pair-1",
			ebookUuid: "ebook-1",
			audiobookUuid: "audio-1",
			originHref: "/dashboard/search?q=alice",
			originHistoryIndex: 4,
			playheadSeconds: 120,
		});
		rememberReadListenReaderPosition({
			storage,
			pairUuid: "pair-1",
			position: {
				exploredCharCount: 420,
				progress: 0.42,
				scrollY: 1_200,
				modifiedAt: 1,
			},
			playheadSeconds: 121,
		});

		expect(
			loadReadListenReaderSession({ storage, pairUuid: "pair-1" }),
		).toEqual({
			version: 1,
			pairUuid: "pair-1",
			ebookUuid: "ebook-1",
			audiobookUuid: "audio-1",
			originHref: "/dashboard/search?q=alice",
			originHistoryIndex: 4,
			entryPlayheadSeconds: 120,
			positionPlayheadSeconds: 121,
			position: {
				exploredCharCount: 420,
				progress: 0.42,
				scrollY: 1_200,
				modifiedAt: 1,
			},
		});
	});

	test("uses browser back only for the untouched reader history entry", () => {
		const session = {
			version: 1 as const,
			pairUuid: "pair-1",
			ebookUuid: "ebook-1",
			audiobookUuid: "audio-1",
			originHref: "/dashboard/search?q=alice",
			originHistoryIndex: 4,
			entryPlayheadSeconds: 120,
		};

		expect(
			planReadListenReaderExit({ session, currentHistoryIndex: 5 }),
		).toEqual({ type: "back" });
		expect(
			planReadListenReaderExit({ session, currentHistoryIndex: 8 }),
		).toEqual({ type: "navigate", href: "/dashboard/search?q=alice" });
	});

	test("rejects external and reader origins and falls back to audiobook details", () => {
		const base = {
			version: 1 as const,
			pairUuid: "pair-1",
			ebookUuid: "ebook-1",
			audiobookUuid: "audio-1",
			originHistoryIndex: 0,
			entryPlayheadSeconds: 120,
		};

		for (const originHref of [
			"https://example.com/steal",
			"//example.com/steal",
			"/reader/ebook-1?pair=pair-1",
		]) {
			expect(
				planReadListenReaderExit({
					session: { ...base, originHref },
					currentHistoryIndex: 0,
				}),
			).toEqual({
				type: "navigate",
				href: "/dashboard/audiobooks/audio-1",
			});
		}
	});

	test("uses explicit fallbacks for a direct synchronized-reader link", () => {
		expect(
			planReadListenReaderExit({
				currentHistoryIndex: 0,
				fallbackAudiobookUuid: "audio-1",
				fallbackEbookUuid: "ebook-1",
			}),
		).toEqual({
			type: "navigate",
			href: "/dashboard/audiobooks/audio-1",
		});
	});

	test("resumes exact text only while the audio playhead is still nearby", () => {
		const position: ReaderPosition = {
			exploredCharCount: 420,
			progress: 0.42,
			modifiedAt: 1,
		};
		expect(
			resolveReadListenReaderPosition({
				livePosition: undefined,
				exploredCharCount: -1,
				rememberedPosition: position,
				rememberedPlayheadSeconds: 120,
				currentPlayheadSeconds: 120.5,
				bookCharCount: 1_000,
			}),
		).toEqual(position);
		expect(
			resolveReadListenReaderPosition({
				livePosition: undefined,
				exploredCharCount: -1,
				rememberedPosition: position,
				rememberedPlayheadSeconds: 120,
				currentPlayheadSeconds: 180,
				bookCharCount: 1_000,
			}),
		).toBeUndefined();
	});
});
