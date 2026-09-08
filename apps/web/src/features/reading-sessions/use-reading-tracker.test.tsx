import "@/test-utils/setup-dom";
import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SessionClock } from "./session-clock";

const upload = mock(async () => ({ runId: crypto.randomUUID() }));
const discard = mock(async () => undefined);
const preferenceKey = ["reading-preferences"];
mock.module("@/utils/orpc", () => ({
	client: {
		readingSessions: {
			preferences: async () => ({ mode: "automatic", idleMinutes: 5 }),
			sync: upload,
			discard,
		},
	},
	orpc: {
		readingSessions: {
			preferences: {
				queryOptions: () => ({ queryKey: preferenceKey }),
				queryKey: () => preferenceKey,
			},
			history: { key: () => ["reading-history"] },
		},
	},
}));
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useReadingTracker } = await import("./use-reading-tracker");
const navigatorDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"navigator",
);

afterEach(async () => {
	cleanup();
	await Promise.resolve();
	localStorage.clear();
	upload.mockClear();
	upload.mockImplementation(async () => ({ runId: crypto.randomUUID() }));
	discard.mockClear();
	mock.restore();
	if (navigatorDescriptor)
		Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
});

function mount(grantRecording: boolean, supportsLocks = true) {
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		value: "visible",
	});
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: {
			userAgent: "Desktop",
			...(supportsLocks
				? {
						locks: {
							request: async (
								name: string,
								options: unknown,
								callback?: (lock: unknown) => unknown,
							) => {
								const run = typeof options === "function" ? options : callback;
								if (name === "nanahoshi-reading:alice" && !grantRecording)
									return;
								return run?.({ name });
							},
						},
					}
				: {}),
		},
	});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	queryClient.setQueryData(preferenceKey, {
		mode: "automatic",
		idleMinutes: 5,
	});
	return renderHook(
		() =>
			useReadingTracker({
				userId: "alice",
				bookUuid: "book",
				contentVersion: "hash",
				enabled: true,
				getPosition: () => 0.1,
			}),
		{
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={queryClient}>
					{children}
				</QueryClientProvider>
			),
		},
	);
}

test("programmatic resume cannot bypass recording ownership", async () => {
	const resume = spyOn(SessionClock.prototype, "resume");
	const hook = mount(false);
	await act(async () => {
		hook.result.current.act("resume");
	});
	expect(resume).not.toHaveBeenCalled();
	expect(hook.result.current.otherTab).toBe(true);
	expect(upload).not.toHaveBeenCalled();
});

test("the tracker publishes every second without uploading every second", async () => {
	let tick: (() => void) | undefined;
	const interval = spyOn(globalThis, "setInterval").mockImplementation(((
		callback: () => void,
		ms: number,
	) => {
		if (ms === 1_000) tick = callback;
		return 1;
	}) as typeof setInterval);
	const clockTick = spyOn(SessionClock.prototype, "tick").mockImplementation(
		function (this: SessionClock) {
			this.seconds += 1;
		},
	);
	const hook = mount(true);
	await act(async () => {});
	expect(tick).toBeDefined();
	const before = upload.mock.calls.length;
	act(() => {
		tick?.();
	});
	expect(hook.result.current.seconds).toBe(1);
	act(() => {
		tick?.();
	});
	expect(hook.result.current.seconds).toBe(2);
	expect(upload.mock.calls.length).toBe(before);
	hook.unmount();
	clockTick.mockRestore();
	interval.mockRestore();
});

test("a browser without Web Locks can still save a reading session", async () => {
	const hook = mount(true, false);
	await act(async () => {});
	await act(async () => {
		hook.result.current.act("start");
	});
	expect(hook.result.current.otherTab).toBe(false);
	expect(hook.result.current.error).toBe(false);
	expect(upload).toHaveBeenCalled();
});

test("discard waits for synchronization and never requeues the finished session", async () => {
	const hook = mount(true, false);
	await act(async () => {});
	await act(async () => {
		hook.result.current.act("start");
	});
	const id = hook.result.current.sessionId;
	await act(async () => {
		hook.result.current.act("finish");
	});
	await act(async () => {
		await hook.result.current.discardSession();
	});
	expect(discard).toHaveBeenCalledWith({ bookUuid: "book", id });
	expect(hook.result.current.sessionId).toBeNull();
	expect(hook.result.current.state).toBe("idle");
	hook.unmount();
	await Promise.resolve();
	expect(
		localStorage.getItem(`nanahoshi:reading-outbox:alice:${id}`),
	).toBeNull();
});

test("a failed sync prevents discard and retains the local session for retry", async () => {
	const hook = mount(true, false);
	await act(async () => {});
	upload.mockImplementation(async () => {
		throw new TypeError("Offline");
	});
	await act(async () => {
		hook.result.current.act("start");
	});
	const id = hook.result.current.sessionId;
	await act(async () => {
		hook.result.current.act("finish");
	});
	await act(async () => {
		await expect(hook.result.current.discardSession()).rejects.toThrow(
			"Sync this session",
		);
	});
	expect(discard).not.toHaveBeenCalled();
	expect(hook.result.current.sessionId).toBe(id);
	expect(
		localStorage.getItem(`nanahoshi:reading-outbox:alice:${id}`),
	).not.toBeNull();
});
