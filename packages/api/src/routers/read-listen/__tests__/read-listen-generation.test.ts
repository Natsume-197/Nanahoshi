import { describe, expect, mock, test } from "bun:test";

mock.module(
	"../../../infrastructure/queue/queues/read-listen-generation.queue",
	() => ({ readListenGenerationQueue: { add: mock(() => Promise.resolve()) } }),
);
mock.module("../../../modules/taskManager", () => ({
	createTask: mock(() => Promise.resolve()),
	failTask: mock(() => Promise.resolve()),
	getTask: mock(() => Promise.resolve(null)),
}));

const { ReadListenGenerationCoordinator } = await import(
	"../read-listen-generation"
);

const generation = {
	id: "generation-1",
	pairId: "pair-1",
	taskId: "task-existing",
	status: "queued" as const,
	provider: "modal",
	quality: "accurate",
	requestedByUserId: "user-1",
	ebookCatalogHash: "ebook-hash",
	audiobookCatalogHash: "audio-hash",
	error: null,
	createdAt: "2026-08-08T00:00:00.000Z",
	startedAt: null,
	finishedAt: null,
	updatedAt: "2026-08-08T00:00:00.000Z",
};

const input = {
	pairUuid: "pair-1",
	serverId: "server-1",
	requestedByUserId: "user-1",
	ebookCatalogHash: "ebook-hash",
	audiobookCatalogHash: "audio-hash",
	label: "Generating alignment for The Book",
};

const config = {
	enabled: true,
	cliPath: null,
	provider: "modal" as const,
	quality: "accurate" as const,
	parallelChunks: 4,
	retries: 3,
	workerConcurrency: 2,
};

type AttemptResult = {
	outcome: "created" | "already_running";
	generation: typeof generation;
};

function harness(
	createGenerationAttempt = mock(
		async (): Promise<AttemptResult> => ({ outcome: "created", generation }),
	),
) {
	const store = {
		createGenerationAttempt,
		updateGenerationStatus: mock(() => Promise.resolve()),
	};
	const tasks = {
		create: mock(() => Promise.resolve()),
		fail: mock(() => Promise.resolve()),
		get: mock(() => Promise.resolve(null)),
	};
	const queue = { add: mock(() => Promise.resolve()) };
	return {
		store,
		tasks,
		queue,
		coordinator: new ReadListenGenerationCoordinator(
			store as never,
			tasks as never,
			queue as never,
			async () => config,
		),
	};
}

describe("ReadListenGenerationCoordinator", () => {
	test("creates one tracked maximum-quality job with source identities", async () => {
		const { coordinator, tasks, queue } = harness();

		const result = await coordinator.enqueue(input);

		expect(result.reused).toBe(false);
		expect(tasks.create).toHaveBeenCalledWith(
			expect.objectContaining({
				id: result.taskId,
				type: "read-listen-generation",
				totalJobs: 1,
				sealed: true,
			}),
		);
		expect(queue.add).toHaveBeenCalledWith(
			"generate",
			expect.objectContaining({
				taskId: result.taskId,
				ebookCatalogHash: "ebook-hash",
				audiobookCatalogHash: "audio-hash",
				settings: config,
			}),
			expect.objectContaining({ jobId: generation.id, attempts: 1 }),
		);
	});

	test("records and queues validated timed-text generation inputs", async () => {
		const { coordinator, store, queue } = harness();
		const timedTextPaths = ["/library/book.srt"];

		await coordinator.enqueue({
			...input,
			mode: "timed-text",
			timedTextPaths,
			verifyTimedText: true,
		});

		expect(store.createGenerationAttempt).toHaveBeenCalledWith(
			expect.objectContaining({ provider: "timed-text" }),
		);
		expect(queue.add).toHaveBeenCalledWith(
			"generate",
			expect.objectContaining({
				mode: "timed-text",
				timedTextPaths,
				verifyTimedText: true,
			}),
			expect.any(Object),
		);
	});

	test("reuses the active task instead of charging Modal twice", async () => {
		const createAttempt = mock(
			async (): Promise<AttemptResult> => ({
				outcome: "already_running",
				generation,
			}),
		);
		const { coordinator, tasks, queue } = harness(createAttempt);
		tasks.get.mockResolvedValue({ status: "running" } as never);

		const result = await coordinator.enqueue(input);

		expect(result).toEqual({
			taskId: generation.taskId,
			generation,
			reused: true,
		});
		expect(tasks.create).not.toHaveBeenCalled();
		expect(queue.add).not.toHaveBeenCalled();
	});

	test("rejects new work when generation is disabled globally", async () => {
		const { store, tasks, queue } = harness();
		const coordinator = new ReadListenGenerationCoordinator(
			store as never,
			tasks as never,
			queue as never,
			async () => ({ ...config, enabled: false }),
		);

		await expect(coordinator.enqueue(input)).rejects.toThrow(
			"Honomiya generation is disabled",
		);
		expect(store.createGenerationAttempt).not.toHaveBeenCalled();
		expect(queue.add).not.toHaveBeenCalled();
	});
});
