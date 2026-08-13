import { describe, expect, mock, test } from "bun:test";
import {
	getReadListenCueDisplayText,
	getReadListenManualScrollDelta,
	getReadListenTextEdgePadding,
	isReadListenManualScrollKey,
	scrollReadListenTextByKey,
	shouldPauseReadListenFollowingOnPointerDown,
} from "./synchronized-text";
import type { ReadListenTimelineCue } from "./timeline";

const timeline: ReadListenTimelineCue[] = [
	{
		id: "quote-one",
		text: {
			kind: "text-quote",
			sectionRef: "chapter.xhtml",
			exact: "First sentence.",
		},
		audioFileIndex: 0,
		startMs: 0,
		endMs: 1_000,
		globalStartMs: 0,
		globalEndMs: 1_000,
	},
	{
		id: "reader-only-fragment",
		text: {
			kind: "fragment",
			sectionRef: "chapter.xhtml",
			fragmentId: "paragraph-two",
		},
		audioFileIndex: 0,
		startMs: 1_000,
		endMs: 2_000,
		globalStartMs: 1_000,
		globalEndMs: 2_000,
	},
	{
		id: "quote-three",
		text: {
			kind: "text-quote",
			sectionRef: "chapter.xhtml",
			exact: "Third sentence.",
		},
		audioFileIndex: 0,
		startMs: 2_000,
		endMs: 3_000,
		globalStartMs: 2_000,
		globalEndMs: 3_000,
	},
];

describe("Read & Listen synchronized text", () => {
	test("keeps fragment intervals in the sequence with an explicit fallback", () => {
		expect(timeline.map(getReadListenCueDisplayText)).toEqual([
			"First sentence.",
			null,
			"Third sentence.",
		]);
	});

	test("reserves enough space to center cues at either edge", () => {
		expect(getReadListenTextEdgePadding(640)).toBe(320);
		expect(getReadListenTextEdgePadding(0)).toBe(0);
	});

	test("recognizes keyboard commands that manually move synchronized text", () => {
		for (const key of [
			"ArrowUp",
			"ArrowDown",
			"PageUp",
			"PageDown",
			"Home",
			"End",
		]) {
			expect(isReadListenManualScrollKey(key)).toBe(true);
		}
		expect(isReadListenManualScrollKey("Tab")).toBe(false);
		expect(isReadListenManualScrollKey("Enter")).toBe(false);
	});

	test("maps keyboard commands to deterministic viewport movement", () => {
		expect(
			getReadListenManualScrollDelta({ key: "ArrowDown", viewportHeight: 500 }),
		).toBe(64);
		expect(
			getReadListenManualScrollDelta({ key: "PageUp", viewportHeight: 500 }),
		).toBe(-400);
		expect(
			getReadListenManualScrollDelta({ key: "Home", viewportHeight: 500 }),
		).toBe("start");
		expect(
			getReadListenManualScrollDelta({ key: "Enter", viewportHeight: 500 }),
		).toBeNull();
	});

	test("moves and focuses the viewport for keyboard-only browsing", () => {
		const focus = mock(() => {});
		const scrollBy = mock(() => {});
		const scrollTo = mock(() => {});
		const viewport = {
			clientHeight: 500,
			scrollHeight: 4_000,
			focus,
			scrollBy,
			scrollTo,
		};

		expect(scrollReadListenTextByKey({ key: "PageDown", viewport })).toBe(true);
		expect(focus).toHaveBeenCalledWith({ preventScroll: true });
		expect(scrollBy).toHaveBeenCalledWith({ top: 400, behavior: "auto" });
		expect(scrollReadListenTextByKey({ key: "End", viewport })).toBe(true);
		expect(scrollTo).toHaveBeenCalledWith({ top: 4_000, behavior: "auto" });
		expect(scrollReadListenTextByKey({ key: "Enter", viewport })).toBe(false);
	});

	test("keeps following while a cue click is in progress", () => {
		const cueTarget = {
			closest: (selector: string) =>
				selector === "[data-read-listen-cue-id]" ? cueTarget : null,
		} as unknown as EventTarget;
		const viewportTarget = {
			closest: () => null,
		} as unknown as EventTarget;

		expect(shouldPauseReadListenFollowingOnPointerDown(cueTarget)).toBe(false);
		expect(shouldPauseReadListenFollowingOnPointerDown(viewportTarget)).toBe(
			true,
		);
	});
});
