import { beforeEach, describe, expect, mock, test } from "bun:test";

type EventHandler = (...args: unknown[]) => unknown;

class MockWorker {
	static instance: MockWorker | undefined;
	processor: (job: {
		data: Record<string, unknown>;
		updateData: (data: Record<string, unknown>) => Promise<void>;
	}) => Promise<unknown>;
	handlers = new Map<string, EventHandler>();

	constructor(
		_name: string,
		processor: (job: {
			data: Record<string, unknown>;
			updateData: (data: Record<string, unknown>) => Promise<void>;
		}) => Promise<unknown>,
	) {
		this.processor = processor;
		MockWorker.instance = this;
	}

	on(event: string, handler: EventHandler) {
		this.handlers.set(event, handler);
		return this;
	}
}

mock.module("bullmq", () => ({ Worker: MockWorker }));
mock.module("../../queue/redis", () => ({ redis: {} }));

const loggerMock = {
	info: mock(() => {}),
	warn: mock(() => {}),
	error: mock(() => {}),
	debug: mock(() => {}),
	child: mock(() => loggerMock),
};
mock.module("../../../lib/logger", () => ({ logger: loggerMock }));

const mockRunLibraryScan = mock(() => Promise.resolve());
mock.module("../../../routers/libraries/library.service", () => ({
	runLibraryScan: mockRunLibraryScan,
	runLibraryReprocess: mock(() => Promise.resolve()),
	runLibraryRegroup: mock(() => Promise.resolve()),
	runLibraryEnrich: mock(() => Promise.resolve()),
}));

const mockFailTask = mock(() => Promise.resolve());
const mockFinalizeTask = mock(() => Promise.resolve());
mock.module("../../../modules/taskManager", () => ({
	failTask: mockFailTask,
	finalizeTask: mockFinalizeTask,
}));

await import("../scheduled-scan.worker");
const worker = MockWorker.instance;
if (!worker) throw new Error("Worker was not constructed");
const failedHandler = worker.handlers.get("failed");
if (!failedHandler) throw new Error("failed handler was not registered");

beforeEach(() => {
	mockFailTask.mockClear();
	mockFinalizeTask.mockClear();
	loggerMock.error.mockClear();
});

describe("scheduled scan worker failure", () => {
	test("persists a scheduled run's generated task id for terminal failure handling", async () => {
		mockRunLibraryScan.mockImplementationOnce(
			async (opts: { persistTaskId?: (taskId: string) => Promise<void> }) => {
				await opts.persistTaskId?.("generated-task");
				throw new Error("disk error");
			},
		);
		const job = {
			data: { libraryId: 1, serverId: "server-1" } as Record<string, unknown>,
			attemptsMade: 3,
			opts: { attempts: 3 },
			updateData: mock(async (data: Record<string, unknown>) => {
				job.data = data;
			}),
		};

		await expect(worker.processor(job)).rejects.toThrow("disk error");
		failedHandler(job, new Error("disk error"));
		await Promise.resolve();

		expect(job.data).toMatchObject({
			op: "scan",
			taskId: "generated-task",
		});
		expect(mockFailTask).toHaveBeenCalledWith("generated-task", "disk error");
	});

	test("does not fail the task while BullMQ still has retries", async () => {
		failedHandler(
			{
				attemptsMade: 1,
				opts: { attempts: 3 },
				data: { libraryId: 1, taskId: "task-1" },
			},
			new Error("temporary disk error"),
		);
		await Promise.resolve();

		expect(mockFailTask).not.toHaveBeenCalled();
		expect(mockFinalizeTask).not.toHaveBeenCalled();
	});

	test("marks an unrecoverable stalled failure terminal before attempts are exhausted", async () => {
		const error = new Error("job stalled beyond its limit");
		error.name = "UnrecoverableError";

		failedHandler(
			{
				attemptsMade: 1,
				opts: { attempts: 3 },
				data: { libraryId: 1, taskId: "task-1" },
			},
			error,
		);
		await Promise.resolve();

		expect(mockFailTask).toHaveBeenCalledWith(
			"task-1",
			"job stalled beyond its limit",
		);
		expect(mockFinalizeTask).not.toHaveBeenCalled();
	});

	test("marks the task failed after the terminal attempt with a sanitized reason", async () => {
		failedHandler(
			{
				attemptsMade: 3,
				opts: { attempts: 3 },
				data: { libraryId: 1, taskId: "task-1" },
			},
			new Error("  disk error\nwith context  "),
		);
		await Promise.resolve();

		expect(mockFailTask).toHaveBeenCalledWith(
			"task-1",
			"disk error with context",
		);
		expect(mockFinalizeTask).not.toHaveBeenCalled();
	});

	test("a terminal scheduled run without a task id stays log-only", async () => {
		failedHandler(
			{
				attemptsMade: 3,
				opts: { attempts: 3 },
				data: { libraryId: 1 },
			},
			new Error("disk error"),
		);
		await Promise.resolve();

		expect(mockFailTask).not.toHaveBeenCalled();
	});
});
