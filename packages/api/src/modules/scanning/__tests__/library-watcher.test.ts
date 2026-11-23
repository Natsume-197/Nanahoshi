import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	mock,
	test,
} from "bun:test";

const watchListeners: Array<() => void> = [];
const closeWatcher = mock(() => {});
const watch = mock(
	(_root: string, _options: { recursive: boolean }, listener: () => void) => {
		watchListeners.push(listener);
		return {
			on: mock(() => {}),
			close: closeWatcher,
		};
	},
);

const findAll = mock(() =>
	Promise.resolve([
		{
			id: 1,
			serverId: "server-1",
			realtimeWatchEnabled: true,
			paths: [{ path: "/library/one", isEnabled: true }],
		},
		{
			id: 2,
			serverId: "server-1",
			realtimeWatchEnabled: false,
			paths: [{ path: "/library/two", isEnabled: true }],
		},
	]),
);

mock.module("../../../routers/libraries/library.repository", () => ({
	libraryRepository: {
		findAll,
		getServerIdByLibraryId: mock((libraryId: number) =>
			Promise.resolve(libraryId <= 3 ? "server-1" : null),
		),
	},
}));

const add = mock((..._args: unknown[]) => Promise.resolve());
mock.module(
	"../../../infrastructure/queue/queues/scheduled-scan.queue",
	() => ({ scheduledScanQueue: { add } }),
);

const watcherLogger = {
	info: mock(() => {}),
	warn: mock(() => {}),
	error: mock(() => {}),
	debug: mock(() => {}),
	child: mock(() => watcherLogger),
};
mock.module("../../../lib/logger", () => ({ logger: watcherLogger }));

const publish = mock((..._args: unknown[]) => Promise.resolve(1));
mock.module("../../../infrastructure/queue/redis", () => ({
	redis: { publish },
}));
let onChannelMessage: ((message: string) => void) | null = null;
mock.module("../../../infrastructure/queue/pubsub", () => ({
	subscribeChannel: (
		_channel: string,
		onMessage: (message: string) => void,
	) => {
		onChannelMessage = onMessage;
		return async () => {
			onChannelMessage = null;
		};
	},
}));

const { requestLibraryWatcherRefresh, startLibraryWatchers } = await import(
	"../library-watcher"
);

describe("library watcher", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		watchListeners.length = 0;
		watch.mockClear();
		closeWatcher.mockClear();
		add.mockClear();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test("registers only libraries with real-time watching enabled", async () => {
		const watchers = await startLibraryWatchers({ watchFilesystem: watch });

		expect(watch).toHaveBeenCalledTimes(1);
		expect(watch).toHaveBeenCalledWith(
			"/library/one",
			{ recursive: true },
			expect.any(Function),
		);

		await watchers.close();
	});

	test("skips real-time watching for libraries mounted through rclone FUSE", async () => {
		const watchers = await startLibraryWatchers({
			watchFilesystem: watch,
			readMountInfo: () =>
				Promise.resolve(
					"42 35 0:42 / /library/one rw,nosuid,nodev - fuse.rclone tmwcrypt: rw",
				),
		});

		expect(watch).not.toHaveBeenCalled();
		expect(watcherLogger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ libraryId: 1, root: "/library/one" }),
			expect.stringContaining("rclone FUSE"),
		);

		await watchers.close();
	});

	test("deduplicates scan jobs across separate filesystem event bursts", async () => {
		const watchers = await startLibraryWatchers({ watchFilesystem: watch });
		const onChange = watchListeners[0];
		expect(onChange).toBeDefined();

		onChange?.();
		jest.advanceTimersByTime(5_000);
		await Promise.resolve();
		onChange?.();
		jest.advanceTimersByTime(5_000);
		await Promise.resolve();

		expect(add).toHaveBeenCalledTimes(2);
		for (const call of add.mock.calls) {
			expect(call).toEqual([
				"library-scan",
				{
					op: "scan",
					libraryId: 1,
					serverId: "server-1",
					mode: "incremental",
				},
				{
					deduplication: {
						id: "library-watch-1",
						keepLastIfActive: true,
					},
				},
			]);
		}

		await watchers.close();
	});

	test("a library created in the API process reaches the worker's watchers", async () => {
		await requestLibraryWatcherRefresh(3);
		expect(publish).toHaveBeenCalledWith("library:watchers", "3");

		const watchers = await startLibraryWatchers({ watchFilesystem: watch });
		watch.mockClear();
		findAll.mockImplementationOnce(() =>
			Promise.resolve([
				{
					id: 3,
					serverId: "server-1",
					realtimeWatchEnabled: true,
					paths: [{ path: "/library/new", isEnabled: true }],
				},
			]),
		);
		onChannelMessage?.("3");
		jest.useRealTimers();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(watch).toHaveBeenCalledWith(
			"/library/new",
			{ recursive: true },
			expect.any(Function),
		);
		await watchers.close();
	});
});
