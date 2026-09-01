import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { JSDOM } from "jsdom";

const saveListening = mock(() => Promise.resolve());
const saveReading = mock(() => Promise.resolve());
const clearActivity = mock(() => Promise.resolve());
const setIdle = mock(() => Promise.resolve());
const documentHandlers = new Map<string, () => void>();
const windowHandlers = new Map<string, () => void>();

mock.module("@/utils/orpc", () => ({
	client: {
		listeningProgress: { saveProgress: saveListening },
		readingProgress: { saveProgress: saveReading },
		presence: { clearActivity, setIdle },
	},
}));
mock.module("@/lib/invalidate-progress", () => ({
	invalidateListeningProgress: () => {},
	invalidateReadingProgress: () => {},
	invalidateRecommendations: () => {},
}));
mock.module("@/hooks/use-document-event", () => ({
	useDocumentEvent: (type: string, handler: () => void) => {
		documentHandlers.set(type, handler);
	},
}));
mock.module("@/hooks/use-window-event", () => ({
	useWindowEvent: (type: string, handler: () => void) => {
		windowHandlers.set(type, handler);
	},
}));
mock.module("@/hooks/use-interval", () => ({ useInterval: () => {} }));
mock.module("@/hooks/use-clear-activity-on-unmount", () => ({
	useClearActivityOnUnmount: () => {},
}));
mock.module("@/features/reader/renderers/shared/reading-time-slice", () => ({
	claimReadingTimeSlice: () => 0,
}));
const { usePresenceIdle } = await import("./use-presence-idle");
const { usePlayerSync } = await import(
	"../components/audio-player/use-player-sync"
);
const { useReaderSync } = await import(
	"../features/reader/interaction/use-reader-sync"
);

beforeAll(() => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>");
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		Node: dom.window.Node,
		IS_REACT_ACT_ENVIRONMENT: true,
	});
});

afterEach(() => {
	cleanup();
	saveListening.mockClear();
	saveReading.mockClear();
	clearActivity.mockClear();
	setIdle.mockClear();
	documentHandlers.clear();
	windowHandlers.clear();
});

describe("live activity lifecycle", () => {
	test("reconciles a stale server-side away flag when idle tracking mounts", () => {
		renderHook(() => usePresenceIdle());

		expect(setIdle).toHaveBeenCalledWith({ idle: false });
	});

	test("announces listening immediately when playback becomes active", async () => {
		const { rerender } = renderHook(
			({ enabled, bookUuid }) =>
				usePlayerSync({
					enabled,
					bookUuid,
					getPlaybackState: () => ({ currentTime: 12, duration: 120 }),
				}),
			{ initialProps: { enabled: false, bookUuid: "audio-1" } },
		);

		await act(async () => {
			rerender({ enabled: true, bookUuid: "audio-1" });
			await Promise.resolve();
		});

		expect(saveListening).toHaveBeenCalledWith(
			expect.objectContaining({ bookUuid: "audio-1", status: "listening" }),
		);
	});

	test("clears listening activity as soon as playback becomes inactive", async () => {
		const { rerender } = renderHook(
			({ enabled }) =>
				usePlayerSync({
					enabled,
					bookUuid: "audio-1",
					getPlaybackState: () => ({ currentTime: 12, duration: 120 }),
				}),
			{ initialProps: { enabled: true } },
		);

		await act(async () => {
			await Promise.resolve();
			clearActivity.mockClear();
			rerender({ enabled: false });
			await Promise.resolve();
		});

		expect(clearActivity).toHaveBeenCalledWith({
			context: { keepalive: true },
		});
	});

	test("saves the latest listening position when playback pauses", async () => {
		let currentTime = 0;
		const { rerender } = renderHook(
			({ enabled }) =>
				usePlayerSync({
					enabled,
					bookUuid: "audio-1",
					getPlaybackState: () => ({
						currentTime,
						duration: 120,
						playbackRate: 1,
					}),
				}),
			{ initialProps: { enabled: true } },
		);

		await act(async () => {
			await Promise.resolve();
		});
		currentTime = 36;
		await act(async () => {
			rerender({ enabled: false });
			await Promise.resolve();
		});

		expect(saveListening).toHaveBeenLastCalledWith(
			expect.objectContaining({ currentTimeSeconds: 36 }),
			{ context: { keepalive: true } },
		);
	});

	test("uses keepalive to save progress when the page closes", async () => {
		const { result } = renderHook(() =>
			usePlayerSync({
				enabled: true,
				bookUuid: "audio-1",
				getPlaybackState: () => ({
					currentTime: 36,
					duration: 120,
					playbackRate: 1,
				}),
			}),
		);
		expect(result.current).toBeDefined();
		await act(async () => {
			await Promise.resolve();
		});
		saveListening.mockClear();

		await act(async () => {
			windowHandlers.get("pagehide")?.();
			await Promise.resolve();
		});

		expect(saveListening).toHaveBeenCalledWith(
			expect.objectContaining({ currentTimeSeconds: 36 }),
			{ context: { keepalive: true } },
		);
	});

	test("serializes a fast pause and resume after an in-flight sync", async () => {
		const transitions: string[] = [];
		let releaseFirstSync: (() => void) | undefined;
		saveListening
			.mockImplementationOnce(
				() =>
					new Promise<void>((resolve) => {
						transitions.push("save:start");
						releaseFirstSync = resolve;
					}),
			)
			.mockImplementationOnce(() => {
				transitions.push("save:resume");
				return Promise.resolve();
			});
		clearActivity.mockImplementationOnce(() => {
			transitions.push("clear");
			return Promise.resolve();
		});

		const { rerender } = renderHook(
			({ enabled }) =>
				usePlayerSync({
					enabled,
					bookUuid: "audio-1",
					getPlaybackState: () => ({ currentTime: 12, duration: 120 }),
				}),
			{ initialProps: { enabled: true } },
		);

		await act(async () => {
			await Promise.resolve();
		});
		act(() => rerender({ enabled: false }));
		act(() => rerender({ enabled: true }));
		expect(transitions).toEqual(["save:start"]);

		await act(async () => {
			releaseFirstSync?.();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(transitions).toEqual(["save:start", "save:resume", "clear"]);
	});

	test("announces reading when the document becomes ready after mount", async () => {
		const { rerender } = renderHook(
			({ enabled }) =>
				useReaderSync({
					enabled,
					bookUuid: "book-1",
					getCharCounts: () => ({
						exploredCharCount: 12,
						bookCharCount: 120,
						positionIntentAt: 1,
					}),
				}),
			{ initialProps: { enabled: false } },
		);

		await act(async () => {
			rerender({ enabled: true });
			await Promise.resolve();
		});

		expect(saveReading).toHaveBeenCalledWith(
			expect.objectContaining({ bookUuid: "book-1", status: "reading" }),
			expect.anything(),
		);
	});

	test("clears reading activity when the reader stops being ready", async () => {
		const { rerender } = renderHook(
			({ enabled }) =>
				useReaderSync({
					enabled,
					bookUuid: "book-1",
					getCharCounts: () => ({
						exploredCharCount: 12,
						bookCharCount: 120,
						positionIntentAt: 1,
					}),
				}),
			{ initialProps: { enabled: true } },
		);

		await act(async () => {
			await Promise.resolve();
			clearActivity.mockClear();
			rerender({ enabled: false });
			await Promise.resolve();
		});

		expect(clearActivity).toHaveBeenCalledWith({
			context: { keepalive: true },
		});
	});
});
