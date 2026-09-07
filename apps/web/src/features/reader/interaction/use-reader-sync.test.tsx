import "@/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";

const saveProgress = mock(async (_input: unknown) => {});
const getProgress = mock(async (_input: unknown): Promise<unknown> => null);
mock.module("@/utils/orpc", () => ({
	client: {
		readingProgress: { saveProgress, getProgress },
		presence: { clearActivity: async () => {} },
	},
}));
mock.module("@/lib/invalidate-progress", () => ({
	invalidateReadingProgress: () => {},
	invalidateRecommendations: () => {},
}));
const { useReaderSync } = await import("./use-reader-sync");
const counts = () => ({
	exploredCharCount: 10,
	bookCharCount: 100,
	positionIntentAt: 100,
});
afterEach(async () => {
	await act(async () => {
		cleanup();
	});
	saveProgress.mockClear();
	getProgress.mockClear();
});

test("retries a failed position write and deduplicates only successful writes", async () => {
	saveProgress.mockRejectedValueOnce(new Error("offline"));
	const hook = renderHook(() =>
		useReaderSync({ bookUuid: "book", enabled: true, getCharCounts: counts }),
	);
	await act(async () => {
		await hook.result.current.syncNow();
	});
	expect(saveProgress.mock.calls[0]?.[0]).toMatchObject({
		exploredCharCount: 10,
		positionIntentAt: 100,
	});
	expect(saveProgress.mock.calls[1]?.[0]).toMatchObject({
		exploredCharCount: 10,
		positionIntentAt: 100,
	});
	await act(async () => {
		await hook.result.current.syncNow();
	});
	expect(saveProgress.mock.calls[2]?.[0]).not.toHaveProperty(
		"exploredCharCount",
	);
});

test("refreshes on device return and discards responses after changing books", async () => {
	const onRemoteProgress = mock(() => {});
	const remote = {
		exploredCharCount: 60,
		bookCharCount: 100,
		positionIntentAt: 200,
	};
	getProgress.mockResolvedValueOnce(remote);
	const hook = renderHook(
		({ bookUuid }) =>
			useReaderSync({
				bookUuid,
				enabled: true,
				getCharCounts: counts,
				onRemoteProgress,
			}),
		{ initialProps: { bookUuid: "first" } },
	);
	await act(async () => {
		window.dispatchEvent(new window.Event("focus"));
		await hook.result.current.syncNow();
	});
	expect(onRemoteProgress).toHaveBeenCalledWith(remote);
	let resolve!: (value: unknown) => void;
	getProgress.mockImplementationOnce(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	await act(async () => {
		window.dispatchEvent(new window.Event("pageshow"));
	});
	hook.rerender({ bookUuid: "second" });
	await act(async () => {
		resolve(remote);
		await hook.result.current.syncNow();
	});
	expect(onRemoteProgress).toHaveBeenCalledTimes(1);
});
