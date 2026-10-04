import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { bindFakeReaderHost } from "@nanahoshi/reader/host/fake-reader-host";
import { renderBindingHook } from "@nanahoshi/test-utils/render-binding-hook";
import { act, cleanup } from "@testing-library/react";
import { JSDOM } from "jsdom";

const saveListening = mock(() => Promise.resolve());
const clearActivity = mock(() => Promise.resolve());
const setIdle = mock(() => Promise.resolve());

mock.module("@/utils/orpc", () => ({
	client: {
		listeningProgress: { saveProgress: saveListening },
		presence: { clearActivity, setIdle },
	},
}));
bindFakeReaderHost({ presence: { clearActivity, setIdle } });
mock.module("@/lib/invalidate-progress", () => ({
	invalidateListeningProgress: () => {},
	invalidateReadingProgress: () => {},
	invalidateRecommendations: () => {},
}));
mock.module("@nanahoshi/ui/hooks/use-document-event", () => ({
	useDocumentEvent: () => {},
}));
mock.module("@nanahoshi/ui/hooks/use-window-event", () => ({
	useWindowEvent: () => {},
}));
mock.module("@nanahoshi/ui/hooks/use-interval", () => ({
	useInterval: () => {},
}));
mock.module("@/hooks/use-clear-activity-on-unmount", () => ({
	useClearActivityOnUnmount: () => {},
}));
const { usePresenceIdle } = await import(
	"@nanahoshi/reader/presence/use-presence-idle"
);
const { usePlayerSync } = await import(
	"../components/audio-player/use-player-sync"
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
	clearActivity.mockClear();
	setIdle.mockClear();
});

describe("live activity lifecycle", () => {
	test("reconciles a stale server-side away flag when idle tracking mounts", () => {
		renderBindingHook(() => usePresenceIdle());

		expect(setIdle).toHaveBeenCalledWith({ idle: false });
	});

	test("announces listening immediately when playback becomes active", async () => {
		const { rerender } = renderBindingHook(
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
			{ context: { keepalive: true } },
		);
	});

	test("clears listening activity as soon as playback becomes inactive", async () => {
		const { rerender } = renderBindingHook(
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

	test("saves the latest listening position before pause clears activity", async () => {
		const transitions: string[] = [];
		saveListening.mockImplementation(async () => {
			transitions.push("save");
		});
		clearActivity.mockImplementation(async () => {
			transitions.push("clear");
		});

		const { rerender } = renderBindingHook(
			({ active, currentTime }) =>
				usePlayerSync({
					enabled: true,
					active,
					bookUuid: "audio-1",
					getPlaybackState: () => ({
						currentTime,
						duration: 600,
						playbackRate: 1,
					}),
				}),
			{ initialProps: { active: true, currentTime: 12 } },
		);

		await act(async () => {
			await Promise.resolve();
			transitions.length = 0;
			rerender({ active: false, currentTime: 137 });
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(saveListening).toHaveBeenLastCalledWith(
			expect.objectContaining({ currentTimeSeconds: 137 }),
			{ context: { keepalive: true } },
		);
		expect(transitions).toEqual(["save", "clear"]);
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
				transitions.push("save:pause");
				return Promise.resolve();
			})
			.mockImplementationOnce(() => {
				transitions.push("save:resume");
				return Promise.resolve();
			});
		clearActivity.mockImplementationOnce(() => {
			transitions.push("clear");
			return Promise.resolve();
		});

		const { rerender } = renderBindingHook(
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

		expect(transitions).toEqual([
			"save:start",
			"save:pause",
			"clear",
			"save:resume",
		]);
	});
});
