import { describe, expect, mock, test } from "bun:test";
import type { ReaderBookmark } from "@/lib/reader/types";
import {
	disableReadListenReader,
	navigateReadListenReaderMode,
	resolveReadListenReaderPosition,
} from "./reader-session";

describe("Read & Listen reader session", () => {
	test("remembers the live reader bookmark before leaving the mode", async () => {
		const position: ReaderBookmark = {
			exploredCharCount: 420,
			progress: 0.42,
			scrollY: 1_200,
			lastBookmarkModified: 1,
		};
		const steps: string[] = [];
		let finishLeaving = () => {};
		const rememberPosition = mock((remembered: ReaderBookmark) => {
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
		const livePosition: ReaderBookmark = {
			exploredCharCount: 420,
			progress: 0.42,
			scrollY: 1_200,
			lastBookmarkModified: 1,
		};
		let rememberedPosition: ReaderBookmark | undefined;
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
				savedBookmark: {
					exploredCharCount: 0,
					progress: 0,
					lastBookmarkModified: 0,
				},
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
});
