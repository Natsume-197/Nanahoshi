import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for the upload service (enqueueUploadedFiles).
 *
 * The queue and task manager are mocked so no Redis is needed. We assert that
 * each written file becomes one "file-event" add job with the exact shape the
 * file-event worker expects (same as the scanner's ebookJobCreator), that the
 * task reserves the job count, and that the task is always finalized.
 *
 * Run with:
 *   bun test packages/api/src/modules/uploads/__tests__/upload.service.test.ts
 */

type Job = { name: string; data: Record<string, unknown> };

let addBulkCalls: Job[][] = [];
const reserveCalls: Array<{ taskId: string; count: number }> = [];
let finalizeCalled = false;
const CREATED_TASK_ID = "task-123";

mock.module("../../../infrastructure/queue/queues/file-event.queue", () => ({
	fileEventQueue: {
		addBulk: mock((jobs: Job[]) => {
			addBulkCalls.push(jobs);
			return Promise.resolve();
		}),
		add: mock(() => Promise.resolve()),
	},
}));

mock.module("../../../lib/logger", () => ({
	logger: {
		child: () => ({ info() {}, warn() {}, error() {} }),
	},
}));

mock.module("../../taskManager", () => ({
	createTask: mock(async () => ({ id: CREATED_TASK_ID })),
	reserve: mock(async (taskId: string, count: number) => {
		reserveCalls.push({ taskId, count });
	}),
	finalizeTask: mock(async () => {
		finalizeCalled = true;
	}),
}));

const { enqueueUploadedFiles } = await import("../upload.service");

describe("enqueueUploadedFiles", () => {
	beforeEach(() => {
		addBulkCalls = [];
		reserveCalls.length = 0;
		finalizeCalled = false;
	});

	test("enqueues one add job per file with the worker's expected shape", async () => {
		const result = await enqueueUploadedFiles({
			files: [
				{
					absolutePath: "/lib/a.epub",
					filename: "a.epub",
					relativePath: "a.epub",
					size: 2048,
					mtimeMs: 1_700_000_000_000,
					fileHash: "hashA",
				},
			],
			libraryId: 5,
			libraryPathId: 9,
			serverId: "srv-1",
			libraryName: "My Library",
		});

		expect(result.taskId).toBe(CREATED_TASK_ID);
		expect(addBulkCalls.length).toBe(1);
		expect(addBulkCalls[0].length).toBe(1);

		const job = addBulkCalls[0][0];
		expect(job.name).toBe("file-event");
		expect(job.data).toEqual({
			action: "add",
			mediaType: "ebook",
			path: "/lib/a.epub",
			mtime: 1_700_000_000_000,
			size: 2048,
			filename: "a.epub",
			relativePath: "a.epub",
			lastModified: new Date(1_700_000_000_000).toISOString(),
			fileHash: "hashA",
			libraryId: 5,
			libraryPathId: 9,
			taskId: CREATED_TASK_ID,
		});

		expect(reserveCalls).toEqual([{ taskId: CREATED_TASK_ID, count: 1 }]);
		expect(finalizeCalled).toBe(true);
	});

	test("does not reserve or enqueue when there are no files, but still finalizes", async () => {
		const result = await enqueueUploadedFiles({
			files: [],
			libraryId: 1,
			libraryPathId: 1,
			serverId: "srv-1",
			libraryName: "Empty",
		});

		expect(addBulkCalls.length).toBe(0);
		expect(reserveCalls.length).toBe(0);
		expect(finalizeCalled).toBe(true);
		expect(result.taskId).toBe(CREATED_TASK_ID);
	});
});
